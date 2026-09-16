#!/usr/bin/python3

import json
import os
import subprocess
import sys
from urllib.parse import urlsplit
from urllib.request import getproxies


def proxy_addresses():
    addresses = set()
    for value in getproxies().values():
        proxy = urlsplit(value)
        if proxy.scheme not in ("http", "https"):
            continue
        if proxy.hostname not in ("localhost", "127.0.0.1", "::1"):
            continue
        host = "[::1]" if proxy.hostname == "::1" else "127.0.0.1"
        port = proxy.port or (443 if proxy.scheme == "https" else 80)
        addresses.add(f"tcp:{host}:{port}")
    return sorted(addresses)


def main():
    addresses = proxy_addresses()
    command = ["/snap/bin/snapcraft", *sys.argv[1:]]
    if not addresses:
        os.execv(command[0], command)

    projects = json.loads(
        subprocess.check_output(["lxc", "project", "list", "--format=json"])
    )
    if not isinstance(projects, list) or any(
        not isinstance(project, dict) or not isinstance(project.get("name"), str)
        for project in projects
    ):
        raise ValueError("LXD returned an invalid project list")
    if not any(project["name"] == "snapcraft" for project in projects):
        profile = subprocess.check_output(
            ["lxc", "--project", "default", "profile", "show", "default"]
        )
        subprocess.run(["lxc", "project", "create", "snapcraft"], check=True)
        subprocess.run(
            ["lxc", "--project", "snapcraft", "profile", "edit", "default"],
            input=profile,
            check=True,
        )

    devices = []
    result = 1
    try:
        for index, address in enumerate(addresses):
            device = f"sfw-{os.getpid()}-{index}"
            subprocess.run(
                [
                    "lxc", "--project", "snapcraft", "profile", "device", "add",
                    "default", device, "proxy", "bind=instance",
                    f"listen={address}", f"connect={address}",
                ],
                check=True,
            )
            devices.append(device)
        result = subprocess.call(command)
    finally:
        for device in devices:
            cleanup = subprocess.run(
                [
                    "lxc", "--project", "snapcraft", "profile", "device", "remove",
                    "default", device,
                ],
                check=False,
            )
            if cleanup.returncode:
                print("Failed to remove the Snapcraft proxy device", file=sys.stderr)
                result = result or cleanup.returncode
    return result if result >= 0 else 128 - result


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Snapcraft proxy setup failed: {error}", file=sys.stderr)
        sys.exit(1)

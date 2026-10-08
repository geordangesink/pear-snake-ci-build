#!/usr/bin/python3

import os
import sys
from ipaddress import ip_address
from urllib.parse import urlsplit


def is_loopback_proxy(value):
    try:
        proxy = urlsplit(value)
        if proxy.scheme not in ("http", "https"):
            return False
        return proxy.hostname == "localhost" or ip_address(proxy.hostname).is_loopback
    except ValueError:
        return False


def main():
    environment = os.environ.copy()
    for name, value in os.environ.items():
        if (
            name.lower().endswith("_proxy")
            and not name.lower().endswith("no_proxy")
            and is_loopback_proxy(value)
        ):
            del environment[name]
    command = ["/snap/bin/snapcraft", *sys.argv[1:]]
    os.execve(command[0], command, environment)


if __name__ == "__main__":
    main()

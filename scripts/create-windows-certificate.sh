#!/bin/sh
set -eu
umask 077

if [ "$#" -gt 2 ]; then
  printf 'Usage: %s [output-directory [subject]]\n' "$0" >&2
  exit 2
fi

output=${1:-out/windows-signing}
subject=${2:-/CN=Snake}

for file in snake.pfx snake.cer; do
  if [ -e "$output/$file" ] || [ -L "$output/$file" ]; then
    printf 'Refusing to overwrite %s\n' "$output/$file" >&2
    exit 1
  fi
done

command -v openssl >/dev/null
temporary=$(mktemp -d "${TMPDIR:-/tmp}/snake-signing.XXXXXXXX")
trap 'rm -rf "$temporary"' 0
trap 'exit 1' HUP INT TERM

cat > "$temporary/openssl.cnf" <<'EOF'
[req]
distinguished_name = subject
x509_extensions = signing
[subject]
[signing]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

openssl req -new -x509 -nodes -newkey rsa:3072 -sha256 -days 1095 \
  -subj "$subject" -config "$temporary/openssl.cnf" \
  -keyout "$temporary/key.pem" -out "$temporary/certificate.pem"

openssl pkcs12 -export -inkey "$temporary/key.pem" \
  -in "$temporary/certificate.pem" -out "$temporary/snake.pfx" \
  -name 'Snake code signing' -keypbe AES-256-CBC -certpbe AES-256-CBC \
  -macalg sha256

if openssl pkcs12 -in "$temporary/snake.pfx" -passin pass: -noout >/dev/null 2>&1; then
  printf 'The certificate password must not be empty.\n' >&2
  exit 1
fi

openssl x509 -in "$temporary/certificate.pem" -outform DER -out "$temporary/snake.cer"

mkdir -p "$output"
set -C
cat "$temporary/snake.pfx" > "$output/snake.pfx"
cat "$temporary/snake.cer" > "$output/snake.cer"
printf 'Created %s/snake.pfx and %s/snake.cer\n' "$output" "$output"

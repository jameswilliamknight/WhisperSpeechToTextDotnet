#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
[[ "$(uname -s)-$(uname -m)" == Darwin-arm64 ]] || { echo 'Requires Apple Silicon macOS' >&2; exit 1; }
mkdir -p .runtime
archive=nemo-speech-0.3.0-macos-aarch64-metal
url="https://github.com/NVIDIA/NeMo-Speech.cpp/releases/download/v0.3.0/$archive.tar.gz"
curl --fail --location --retry 3 "$url" -o .runtime/runtime.tar.gz
# Literal digest pins the release independently of a remotely fetched checksum file.
echo '2b972ed8b5dba07492212acf8cb75cbf34ecb141198ffa1997febe84b7c4d9ed  .runtime/runtime.tar.gz' | shasum -a 256 -c -
tar -xzf .runtime/runtime.tar.gz -C .runtime
export NEMO_SPEECH_MODEL_DIR="$PWD/models"
cli=".runtime/$archive/bin/nemo-speech"
"$cli" pull parakeet-tdt
"$cli" pull nemotron-3-diarization
"$cli" doctor

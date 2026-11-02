#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
revision=4979e04f5dcaccb36057e059bbaed8a2f5288315
mkdir -p .runtime models results
if [[ ! -f .runtime/whisper.cpp/CMakeLists.txt ]]; then
  curl -fL --retry 2 "https://api.github.com/repos/ggml-org/whisper.cpp/tarball/$revision" -o .runtime/source.tar.gz
  mkdir -p .runtime/whisper.cpp
  tar -xzf .runtime/source.tar.gz -C .runtime/whisper.cpp --strip-components=1
  rm .runtime/source.tar.gz
fi
cmake -S .runtime/whisper.cpp -B .runtime/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release \
  -DGGML_METAL=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
cmake --build .runtime/whisper.cpp/build --config Release --target whisper-cli -j 4
file=models/ggml-large-v3-turbo.bin
sha=1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69
if [[ ! -f "$file" ]]; then
  curl -fL --retry 2 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo.bin' -o "$file.part"
  echo "$sha  $file.part" | shasum -a 256 -c -
  mv "$file.part" "$file"
fi
echo "$sha  $file" | shasum -a 256 -c -

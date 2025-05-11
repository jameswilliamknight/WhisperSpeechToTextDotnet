## About

Experimental project for using .NET to convert speech to text, and writing modular code to help reuse.

I wanted to build it so I could one day add something to my Raspberry Pi `raspotify` devices, and add smart voice assistant capabilities. That would then entail an client-server architecture, and some kind of deployment model. Alternatively or additionally this project will acquire a web server to provide an easy to use React web interface.

This project is open source to expand my portfolio of work. I didn't know what kind of license to add, so it's probably going to change.


## Setup Guide

### Environment

_Example uses Ubuntu on WSL on Windows 11, but the same will need to be applied to a Raspberry Pi 5 (8GB, 16GB)_

```sh
sudo apt update
sudo apt install ffmpeg

# Bare Metal
sudo apt install alsa-utils

## WSL/Ubuntu
sudo apt install pulseaudio-utils
```

## 🛠️ Troubleshooting

For guidance on common issues, please refer to the relevant troubleshooting document:

- **Windows Audio (NAudio):** [./docs/troubleshooting/WindowsAudio.md](./docs/troubleshooting/WindowsAudio.md) _(Placeholder - to be created if detailed steps are needed)_
- **Bare-Metal Linux Audio (ALSA / `arecord`):** [./docs/troubleshooting/BareMetalLinuxAudio.md](./docs/troubleshooting/BareMetalLinuxAudio.md) _(Placeholder - to be created if detailed steps are needed)_
- **WSL Audio (PulseAudio / `parec` - for Live Transcription):** [./docs/live_transcription/Troubleshooting.md](./docs/live_transcription/Troubleshooting.md)


### Models - Download

https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md

| Model               | Disk    | SHA                                        |
| ------------------- | ------- | ------------------------------------------ |
| tiny                | 75 MiB  | `bd577a113a864445d4c299885e0cb97d4ba92b5f` |
| tiny.en             | 75 MiB  | `c78c86eb1a8faa21b369bcd33207cc90d64ae9df` |
| base                | 142 MiB | `465707469ff3a37a2b9b8d8f89f2f99de7299dac` |
| base.en             | 142 MiB | `137c40403d78fd54d454da0f9bd998f78703390c` |
| small               | 466 MiB | `55356645c2b361a969dfd0ef2c5a50d530afd8d5` |
| small.en            | 466 MiB | `db8a495a91d927739e50b3fc1cc4c6b8f6c2d022` |
| small.en-tdrz       | 465 MiB | `b6c6e7e89af1a35c08e6de56b66ca6a02a2fdfa1` |
| medium              | 1.5 GiB | `fd9727b6e1217c2f614f9b698455c4ffd82463b4` |
| medium.en           | 1.5 GiB | `8c30f0e44ce9560643ebd10bbe50cd20eafd3723` |
| large-v1            | 2.9 GiB | `b1caaf735c4cc1429223d5a74f0f4d0b9b59a299` |
| large-v2            | 2.9 GiB | `0f4c8e34f21cf1a914c59d8b3ce882345ad349d6` |
| large-v2-q5_0       | 1.1 GiB | `00e39f2196344e901b3a2bd5814807a769bd1630` |
| large-v3            | 2.9 GiB | `ad82bf6a9043ceed055076d0fd39f5f186ff8062` |
| large-v3-q5_0       | 1.1 GiB | `e6e2ed78495d403bef4b7cff42ef4aaadcfea8de` |
| large-v3-turbo      | 1.5 GiB | `4af2b29d7ec73d781377bfd1758ca957a807e941` |
| large-v3-turbo-q5_0 | 547 MiB | `e050f7970618a659205450ad97eb95a18d69c9ee` |

Download [this script](https://github.com/ggml-org/whisper.cpp/blob/master/models/download-ggml-model.sh) and execute it:

```sh
# https://github.com/ggml-org/whisper.cpp/blob/master/models/download-ggml-model.sh
wget https://raw.githubusercontent.com/ggml-org/whisper.cpp/refs/heads/master/models/download-ggml-model.sh

chmod +x ./download-ggml-model.sh

./download-ggml-model.sh large-v3

mkdir models
mv ggml-large-v3.bin ./models/ggml-large-v3.bin
```

#### Verify Checksum

```sh
sha1sum ./models/ggml-large-v3.bin

# ad82bf6a9043ceed055076d0fd39f5f186ff8062  ./models/ggml-large-v3.bin
```


### 📝 Feature Development Plans

#### Live Transcription Feature

- [High-Level Plan](./docs/live_transcription/README.md)
- [Implementation Details](./docs/live_transcription/Details.md)

#### Model Management Features

- [High-Level Plan](./docs/model_management/README.md)
- [Roadmap](./docs/model_management/Roadmap.md)


## 💡 Similar Projects

- **`ufal/whisper_streaming`**: [https://github.com/ufal/whisper_streaming](https://github.com/ufal/whisper_streaming)
    - A Python project demonstrating real-time transcription with Whisper. It employs techniques like Voice Activity Detection (VAD), adaptive latency, buffer trimming based on segments/sentences, and a local agreement policy to confirm transcribed segments. These are concepts that could be valuable for a robust C# live transcription implementation.

# Transcribe launcher

Adapted from Freebore's `bin/install` and launcher pattern.

```sh
bash bin/install
transcribe             # Starts or reuses the local app and opens a browser
transcribe --headless  # No browser
transcribe --help
```

Installation appends this checkout's `bin` directory to `~/.zshrc` once and backs up the existing file before changing it. Open a new terminal or run `source ~/.zshrc`. `--skip-deps` only skips dependency installation; it is useful when reinstalling the PATH entry.

The command requires Bun and the existing Whisper/Nemotron setup documented in `apps/transcription-studio/README.md`. It does not download models, install .NET, or expose the app beyond localhost.

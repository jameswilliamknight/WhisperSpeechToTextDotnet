[<- Back to Main README](../README.md)

# Model Management Feature Plan

This document outlines the high-level tasks for implementing a model management feature within the WhisperPrototype application. This feature will allow users to manage the Whisper model files used by the application.

## Current Model Handling & Motivations for Change

-   Models are currently stored in a `./Models` subdirectory relative to the application's execution path (`AppContext.BaseDirectory`).
    -   **Issue:** If models are included in the project and set to "Copy to Output Directory", this can lead to large model files (often 1-3GB each) being duplicated in the build output for each configuration (e.g., Debug, Release). This consumes significant disk space and is inefficient.
-   Model selection occurs at application startup via a prompt in `Workspace.cs`.
-   The `download-ggml-model.sh` script provides a reference for model names, sources, and download logic.
-   **Goal:** Transition to a system where models are stored in a single, canonical location in userspace (user-configurable), preventing duplication in build outputs and ensuring all parts of the application reference this single store.

## Task Breakdown

1.  **Configure Model Storage Location**

    -   Allow users to specify a custom directory for storing models (e.g., via `appsettings.json`).
    -   Update `Workspace.cs` to use this configured path. If not set, default to the current `./Models` path.
    -   Display the currently configured model storage location to the user within the "Manage Models" section.

2.  **List Available and Downloaded Models**

    -   **List Local Models:** Scan the configured models directory and display a list of already downloaded/present `.bin` files.
    -   **List Remote Models:**
        -   Fetch or maintain a list of available models (similar to the list in `download-ggml-model.sh`). This could be from a hardcoded list, a simple config file, or (more advanced) by querying a source like Hugging Face if feasible and desired.
        -   Indicate which remote models are already downloaded.

3.  **Download New Models**

    -   Allow users to select a model from the list of available (not yet downloaded) remote models.
    -   Implement download logic within the C# application.
        -   This could involve making HTTP requests to the model URLs (e.g., from Hugging Face, as seen in the shell script).
        -   Show download progress if possible.
        -   Save the downloaded model to the configured models directory with the correct naming convention (e.g., `ggml-<model_name>.bin`).
        -   Perform a checksum verification after download if feasible (SHA hashes are available in the `README.md` model table).

4.  **Delete Existing Models**

    -   Allow users to select one or more downloaded models from the local list.
    -   Confirm deletion with the user.
    -   Delete the selected model file(s) from the models directory.

5.  **User Interface (within "Manage Models" section)**
    -   Use `Spectre.Console` components (SelectionPrompt, MultiSelectionPrompt, etc.) for interactions.
    -   Provide clear feedback on actions (downloading, deleting, listing, errors).

## Quality of Life Features (Considerations for initial or later implementation)

-   **Model Information:** Display basic information about models (size, type e.g., '.en' for English-only) when listing.
-   **Default Model:** Consider allowing the user to set a default model to be pre-selected or automatically used if only one is present.
-   **Checksum Verification:** Integrate checksum verification for downloaded models to ensure integrity.
-   **Background Downloads:** For larger models, consider if background downloading with progress indication is necessary (might be overly complex for a console app initially).

This plan will be refined as development progresses. Detailed implementation steps for each task will be broken down further.

#!/usr/bin/env bash

# Note: this script only applies for either developing or running under Ubuntu on WSL on Windows.

set -e # Exit immediately if a command exits with a non-zero status.

# --- System Setup ---
echo "Updating and upgrading system packages..."
sudo apt update
sudo apt upgrade -y

echo "Installing essential dependencies..."
# Install essential dependencies for building software and CUDA installation
sudo apt install -y \
    build-essential \
    cmake \
    git \
    wget \
    ca-certificates \
    apt-transport-https

# --- Configuration & Version Determination ---
CUDA_TOOLKIT_VERSION_TO_INSTALL=""
NVIDIA_REPO_UBUNTU_VERSION=""

UBUNTU_VERSION_MAJOR_MINOR=$(lsb_release -rs)
UBUNTU_CODENAME=$(lsb_release -cs) # e.g., noble, focal, jammy

echo "Detected Ubuntu version: $UBUNTU_VERSION_MAJOR_MINOR ($UBUNTU_CODENAME)"

if [[ "$UBUNTU_VERSION_MAJOR_MINOR" == "20.04" ]]; then
    NVIDIA_REPO_UBUNTU_VERSION="ubuntu2004"
    CUDA_TOOLKIT_VERSION_TO_INSTALL="12-1"
elif [[ "$UBUNTU_VERSION_MAJOR_MINOR" == "22.04" ]]; then
    NVIDIA_REPO_UBUNTU_VERSION="ubuntu2204"
    CUDA_TOOLKIT_VERSION_TO_INSTALL="12-1"
elif [[ "$UBUNTU_VERSION_MAJOR_MINOR" == "24.04" ]]; then
    NVIDIA_REPO_UBUNTU_VERSION="ubuntu2404"
    CUDA_TOOLKIT_VERSION_TO_INSTALL="12-5" # Target for Noble
else
    echo "Error: Unsupported Ubuntu version: $UBUNTU_VERSION_MAJOR_MINOR for this script."
    exit 1
fi

echo "Selected NVIDIA repository identifier: $NVIDIA_REPO_UBUNTU_VERSION"
echo "Targeting CUDA Toolkit version: $CUDA_TOOLKIT_VERSION_TO_INSTALL for installation."

# --- Install NVIDIA CUDA Toolkit (Network Repository Method) ---
echo "Cleaning up any old CUDA repository configurations..."
sudo rm -f /etc/apt/sources.list.d/cuda*
sudo rm -f /usr/share/keyrings/cuda-archive-keyring.gpg # Remove old key just in case

echo "Adding NVIDIA CUDA repository using cuda-keyring..."
KEYRING_DEB_VERSION="1.1-1"
KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/${NVIDIA_REPO_UBUNTU_VERSION}/x86_64/cuda-keyring_${KEYRING_DEB_VERSION}_all.deb"
KEYRING_DEB="cuda-keyring_${KEYRING_DEB_VERSION}_all.deb"

if ! wget --spider "${KEYRING_URL}" 2>/dev/null; then
    echo "Error: CUDA Keyring URL seems invalid or unreachable: ${KEYRING_URL}"
    exit 1
fi

echo "Downloading CUDA keyring from ${KEYRING_URL}..."
wget -O "${KEYRING_DEB}" "${KEYRING_URL}"
echo "Installing CUDA keyring..."
sudo dpkg -i "${KEYRING_DEB}"
echo "Cleaning up downloaded keyring deb file..."
rm "${KEYRING_DEB}"

echo ""
echo "--- DIAGNOSTIC STEP 1: Verify NVIDIA Repository Configuration (after keyring attempt) ---"
NVIDIA_SOURCES_LIST_EXPECTED_NAME="cuda-${NVIDIA_REPO_UBUNTU_VERSION}-x86_64.list" # Common naming pattern
NVIDIA_SOURCES_LIST_PATH="/etc/apt/sources.list.d/${NVIDIA_SOURCES_LIST_EXPECTED_NAME}"
MANUAL_NVIDIA_SOURCES_LIST_PATH="/etc/apt/sources.list.d/cuda-manual-${NVIDIA_REPO_UBUNTU_VERSION}.list"

if [ -f "${NVIDIA_SOURCES_LIST_PATH}" ]; then
    echo "NVIDIA CUDA repository list file (from keyring) found: ${NVIDIA_SOURCES_LIST_PATH}"
    echo "Contents:"
    sudo cat "${NVIDIA_SOURCES_LIST_PATH}"
elif [ -f "${MANUAL_NVIDIA_SOURCES_LIST_PATH}" ]; then
    echo "NVIDIA CUDA repository list file (manual) already exists: ${MANUAL_NVIDIA_SOURCES_LIST_PATH}"
else
    echo "WARNING: Expected NVIDIA CUDA repository list file (${NVIDIA_SOURCES_LIST_PATH}) was NOT found after keyring install."
    echo "Other cuda-*.list files in /etc/apt/sources.list.d/:"
    ls -1 /etc/apt/sources.list.d/cuda* || echo "No cuda-*.list files found."
    echo "This suggests the cuda-keyring package did not create the repository file as expected."
    echo "Proceeding with manual repository setup."
fi
echo "--- END DIAGNOSTIC STEP 1 ---"
echo ""

# --- Fallback: Manual Repository and Key Setup ---
# This section will run if the keyring method fails or as a primary method if preferred.
echo "Attempting manual NVIDIA repository setup..."
# Ensure the GPG key is present
# sudo apt-key del 7fa2af80 # This is deprecated, using /usr/share/keyrings is preferred
echo "Downloading NVIDIA GPG key..."
wget -qO - https://developer.download.nvidia.com/compute/cuda/repos/${NVIDIA_REPO_UBUNTU_VERSION}/x86_64/cuda-archive-keyring.gpg | sudo tee /usr/share/keyrings/cuda-archive-keyring.gpg > /dev/null
# Create the repository file manually
NVIDIA_MANUAL_SOURCES_FILE="/etc/apt/sources.list.d/cuda-manual-${NVIDIA_REPO_UBUNTU_VERSION}.list"
echo "Creating manual repository source file: ${NVIDIA_MANUAL_SOURCES_FILE}"
echo "deb [signed-by=/usr/share/keyrings/cuda-archive-keyring.gpg] https://developer.download.nvidia.com/compute/cuda/repos/${NVIDIA_REPO_UBUNTU_VERSION}/x86_64/ /" | sudo tee "${NVIDIA_MANUAL_SOURCES_FILE}" > /dev/null
echo "Manual repository file created at ${NVIDIA_MANUAL_SOURCES_FILE} with contents:"
sudo cat "${NVIDIA_MANUAL_SOURCES_FILE}"
# --- End Fallback ---


echo "Updating package lists after attempting to add CUDA repository..."
sudo apt update

echo ""
echo "--- DIAGNOSTIC STEP 2: Inspect 'apt update' Output ---"
echo "Please CAREFULLY inspect the output of the 'sudo apt update' command immediately above."
echo "You SHOULD see lines similar to:"
echo "  Get:X https://developer.download.nvidia.com/compute/cuda/repos/${NVIDIA_REPO_UBUNTU_VERSION}/x86_64 ... InRelease"
echo "  Get:Y https://developer.download.nvidia.com/compute/cuda/repos/${NVIDIA_REPO_UBUNTU_VERSION}/x86_64 ... Packages"
echo "or 'Hit:' if the repository was already known and up-to-date."
echo ""
echo "If you DO NOT see these lines referencing 'developer.download.nvidia.com',"
echo "then the NVIDIA repository is NOT being accessed by apt."
echo "This is why 'apt install' would fail to find CUDA packages."
echo "Press Enter to continue with the script, or Ctrl+C to abort and investigate further."
read -r
echo "--- END DIAGNOSTIC STEP 2 ---"
echo ""


# Install the specified CUDA Toolkit version
CUDA_PKG_NAME="cuda-toolkit-${CUDA_TOOLKIT_VERSION_TO_INSTALL}"
echo "Attempting to install ${CUDA_PKG_NAME}..."
if sudo apt install -y "${CUDA_PKG_NAME}" --no-install-recommends; then
    echo "${CUDA_PKG_NAME} installation successful."
else
    echo "ERROR: Failed to install ${CUDA_PKG_NAME}."
    echo "This usually means the package was not found in the configured repositories."
    echo "Please review the diagnostic steps above and check NVIDIA's official documentation for Ubuntu ${UBUNTU_VERSION_MAJOR_MINOR}."
    echo "You can try searching for available toolkit versions with: apt-cache search cuda-toolkit"
    exit 1
fi

# --- Configure Environment Variables (System-Wide) ---
CUDA_ENV_SCRIPT_PATH="/etc/profile.d/cuda_env.sh"
CUDA_HOME="/usr/local/cuda"

echo "Configuring system-wide environment variables for CUDA..."
echo "export PATH=${CUDA_HOME}/bin\${PATH:+:\${PATH}}" | sudo tee "${CUDA_ENV_SCRIPT_PATH}" > /dev/null
echo "export LD_LIBRARY_PATH=${CUDA_HOME}/lib64\${LD_LIBRARY_PATH:+:\${LD_LIBRARY_PATH}}" | sudo tee -a "${CUDA_ENV_SCRIPT_PATH}" > /dev/null
sudo chmod +x "${CUDA_ENV_SCRIPT_PATH}"

# --- Final Instructions ---
echo ""
echo "CUDA Toolkit ${CUDA_TOOLKIT_VERSION_TO_INSTALL} installation script finished."
echo "---------------------------------------------------------------------"
echo "IMPORTANT NEXT STEPS:"
echo "1. Close and REOPEN your WSL terminal, or run 'source ${CUDA_ENV_SCRIPT_PATH}'"
echo "   to apply the new environment variables."
echo "2. Verify CUDA installation with: nvcc --version"
echo "   This should show the CUDA compiler version (e.g., ${CUDA_TOOLKIT_VERSION_TO_INSTALL})."
echo "3. Remember: 'nvidia-smi' command will NOT work inside WSL2 to show GPU details."
echo "   Run 'nvidia-smi' on your Windows Command Prompt or PowerShell."
echo "4. Ensure your Windows NVIDIA drivers are up to date for WSL2 GPU support."
echo "---------------------------------------------------------------------"

exit 0
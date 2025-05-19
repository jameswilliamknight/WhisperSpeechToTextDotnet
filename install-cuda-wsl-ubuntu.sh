#!/bin/bash

# Note: this only applies for either developing or running under Ubuntu on WSL on Windows.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Configuration ---
# Define the target CUDA Toolkit version (e.g., "12-1", "11-8", "12-5")
# Ensure this version is available in NVIDIA's repo for your Ubuntu release.
CUDA_TOOLKIT_VERSION_MAJOR_MINOR="12-1"

# --- System Setup ---
sudo apt update
sudo apt upgrade -y

# Install essential dependencies for building software and CUDA installation
sudo apt install -y \
    build-essential \
    cmake \
    git \
    wget \
    ca-certificates \
    apt-transport-https

# --- Determine Ubuntu Version for NVIDIA Repository ---
UBUNTU_VERSION_MAJOR_MINOR=$(lsb_release -rs)
NVIDIA_REPO_UBUNTU_VERSION=""

if [[ "$UBUNTU_VERSION_MAJOR_MINOR" == "20.04" ]]; then
    NVIDIA_REPO_UBUNTU_VERSION="ubuntu2004"
elif [[ "$UBUNTU_VERSION_MAJOR_MINOR" == "22.04" ]]; then
    NVIDIA_REPO_UBUNTU_VERSION="ubuntu2204"
elif [[ "$UBUNTU_VERSION_MAJOR_MINOR" == "24.04" ]]; then # For newer LTS
    NVIDIA_REPO_UBUNTU_VERSION="ubuntu2404"
else
    echo "Error: Unsupported Ubuntu version: $UBUNTU_VERSION_MAJOR_MINOR for this script."
    echo "Please check NVIDIA's website for CUDA installation instructions for your version."
    exit 1
fi

echo "Detected: Ubuntu version: $UBUNTU_VERSION_MAJOR_MINOR for this script."

# --- Install NVIDIA CUDA Toolkit (Network Repository Method) ---
# Clean up any old CUDA repository configurations
sudo rm -f /etc/apt/sources.list.d/cuda*

# Add NVIDIA CUDA repository
# The cuda-keyring package sets up the appropriate sources for your distribution.
KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/${NVIDIA_REPO_UBUNTU_VERSION}/x86_64/cuda-keyring_1.1-1_all.deb"
KEYRING_DEB="cuda-keyring_1.1-1_all.deb"

wget "${KEYRING_URL}"
sudo dpkg -i "${KEYRING_DEB}"
rm "${KEYRING_DEB}" # Clean up downloaded deb file
sudo apt update

# Install the specified CUDA Toolkit version
# Using --no-install-recommends to avoid potentially unwanted packages like display drivers
CUDA_PKG_NAME="cuda-toolkit-${CUDA_TOOLKIT_VERSION_MAJOR_MINOR}"
echo "Installing ${CUDA_PKG_NAME}..."
sudo apt install -y "${CUDA_PKG_NAME}" --no-install-recommends

# --- Configure Environment Variables (System-Wide) ---
# These environment variables are crucial for the system and applications to find and use the CUDA toolkit.
# PATH tells the shell where to find CUDA executable commands (like nvcc).
# LD_LIBRARY_PATH tells the dynamic linker where to find CUDA shared libraries (.so files) at runtime.
# Placing these settings in /etc/profile.d/ ensures they are set system-wide
# for ALL users and ALL login shell sessions.
# This approach guarantees that any program compiled against or dependent on CUDA
# can find the necessary components, regardless of the user running it (including root)
# or how the shell session was initiated. It's a standard practice for system-wide software availability.
CUDA_ENV_SCRIPT_PATH="/etc/profile.d/cuda_env.sh"
# Note: The CUDA toolkit is typically installed in a version-specific directory (e.g., /usr/local/cuda-12.1),
# and a symbolic link "/usr/local/cuda" is often created to point to the currently active version.
# We configure variables using "/usr/local/cuda" for consistency, assuming the symlink exists and is correct.
CUDA_HOME="/usr/local/cuda" # Path to the active CUDA installation via the symlink

echo "export PATH=${CUDA_HOME}/bin\${PATH:+:\${PATH}}" | sudo tee "${CUDA_ENV_SCRIPT_PATH}" > /dev/null
echo "export LD_LIBRARY_PATH=${CUDA_HOME}/lib64\${LD_LIBRARY_PATH:+:\${LD_LIBRARY_PATH}}" | sudo tee -a "${CUDA_ENV_SCRIPT_PATH}" > /dev/null
sudo chmod +x "${CUDA_ENV_SCRIPT_PATH}"

# --- Final Instructions ---
echo ""
echo "CUDA Toolkit ${CUDA_TOOLKIT_VERSION_MAJOR_MINOR} installation script finished."
echo "---------------------------------------------------------------------"
echo "IMPORTANT NEXT STEPS:"
echo "1. Close and REOPEN your WSL terminal, or run 'source ${CUDA_ENV_SCRIPT_PATH}'"
echo "   to apply the new environment variables."
echo "2. Verify CUDA installation with: nvcc --version"
echo "   This should show the CUDA compiler version."
echo "3. Remember: 'nvidia-smi' command will NOT work inside WSL2 to show GPU details."
echo "   Run 'nvidia-smi' on your Windows Command Prompt or PowerShell."
echo "4. Ensure your Windows NVIDIA drivers are up to date for WSL2 GPU support."
echo "---------------------------------------------------------------------"

exit 0
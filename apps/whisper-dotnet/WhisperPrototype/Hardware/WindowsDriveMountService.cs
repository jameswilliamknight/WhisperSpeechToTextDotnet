using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

namespace WhisperPrototype.Hardware;

/// <summary>
/// Service for mounting and unmounting Windows drives in WSL
/// </summary>
public class WindowsDriveMountService
{
    private const string DefaultMountBasePath = "/mnt";
    private readonly HashSet<string> _sessionMounts = new();
    
    /// <summary>
    /// Get the mount status of a Windows drive
    /// </summary>
    public async Task<(MountStatus status, string? mountPoint)> GetDriveMountStatusAsync(string driveLetter)
    {
        var mountedDrives = await GetMountedDrivesAsync();
        var drive = mountedDrives.FirstOrDefault(d => 
            d.DriveLetter.Equals(driveLetter, StringComparison.OrdinalIgnoreCase));
        
        if (drive != null)
            return (MountStatus.Mounted, drive.MountPoint);
        
        // Check if drive exists in Windows
        var driveExists = await CheckWindowsDriveExistsAsync(driveLetter);
        return driveExists 
            ? (MountStatus.NotMounted, null) 
            : (MountStatus.UnknownDrive, null);
    }
    
    /// <summary>
    /// Get all mounted Windows drives
    /// </summary>
    public async Task<List<MountedDrive>> GetMountedDrivesAsync()
    {
        var result = await RunCommandAsync("mount", "");
        if (result.exitCode != 0)
            return new List<MountedDrive>();
        
        var drives = new List<MountedDrive>();
        var lines = result.output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        
        // Pattern: C: on /mnt/c type drvfs (...)
        // Pattern: C: on /mnt/c type 9p (...)
        // Pattern: C:\ on /mnt/c type drvfs (...) - legacy format
        var pattern = new Regex(@"^([A-Z]):\\? on (\/[^\s]+) type (drvfs|9p)", RegexOptions.IgnoreCase);
        
        foreach (var line in lines)
        {
            var match = pattern.Match(line);
            if (match.Success)
            {
                var driveLetter = match.Groups[1].Value.ToUpper();
                drives.Add(new MountedDrive
                {
                    DriveLetter = driveLetter,
                    MountPoint = match.Groups[2].Value,
                    FileSystemType = match.Groups[3].Value,
                    IsSessionMount = _sessionMounts.Contains(driveLetter)
                });
            }
        }
        
        return drives;
    }
    
    /// <summary>
    /// Mount a Windows drive in WSL
    /// Note: Requires the application to be running with sudo privileges or allows interactive sudo
    /// </summary>
    public async Task<MountResult> MountDriveAsync(string driveLetter, string? mountPoint = null)
    {
        driveLetter = driveLetter.ToUpper();
        
        // Check if already mounted
        var (status, existingMountPoint) = await GetDriveMountStatusAsync(driveLetter);
        if (status == MountStatus.Mounted)
        {
            return new MountResult
            {
                Success = true,
                MountPoint = existingMountPoint,
                ErrorMessage = null
            };
        }
        
        if (status == MountStatus.UnknownDrive)
        {
            return new MountResult
            {
                Success = false,
                ErrorMessage = $"Drive {driveLetter}: does not exist or is not accessible"
            };
        }
        
        // Determine mount point
        mountPoint ??= $"{DefaultMountBasePath}/{driveLetter.ToLower()}";
        
        // Create mount point directory if it doesn't exist
        if (!Directory.Exists(mountPoint))
        {
            var mkdirResult = await RunInteractiveSudoCommandAsync("mkdir", $"-p {mountPoint}");
            if (mkdirResult.exitCode != 0)
            {
                return new MountResult
                {
                    Success = false,
                    ErrorMessage = $"Failed to create mount point: {mkdirResult.error.Trim()}"
                };
            }
        }
        
        // Mount the drive with sudo (allows password prompt if needed)
        var mountResult = await RunInteractiveSudoCommandAsync("mount", $"-t drvfs {driveLetter}: {mountPoint}");
        
        if (mountResult.exitCode == 0)
        {
            _sessionMounts.Add(driveLetter);
            return new MountResult
            {
                Success = true,
                MountPoint = mountPoint
            };
        }
        
        return new MountResult
        {
            Success = false,
            ErrorMessage = $"Mount failed: {mountResult.error}"
        };
    }
    
    /// <summary>
    /// Unmount a Windows drive
    /// Note: Requires the application to be running with sudo privileges
    /// </summary>
    public async Task<bool> UnmountDriveAsync(string driveLetter)
    {
        driveLetter = driveLetter.ToUpper();
        
        var (status, mountPoint) = await GetDriveMountStatusAsync(driveLetter);
        if (status != MountStatus.Mounted || mountPoint == null)
            return false;
        
        var result = await RunInteractiveSudoCommandAsync("umount", mountPoint);
        
        if (result.exitCode == 0)
        {
            _sessionMounts.Remove(driveLetter);
            return true;
        }
        
        return false;
    }
    
    /// <summary>
    /// Check if we have sudo permissions (without password prompt)
    /// </summary>
    public async Task<bool> CanUseSudoAsync()
    {
        var result = await RunCommandAsync("sudo", "-n true");
        return result.exitCode == 0;
    }
    
    /// <summary>
    /// Get list of drives that were mounted during this session
    /// </summary>
    public List<string> GetSessionMounts()
    {
        return _sessionMounts.ToList();
    }
    
    /// <summary>
    /// Mark a drive as mounted during this session
    /// </summary>
    public void MarkAsSessionMount(string driveLetter)
    {
        _sessionMounts.Add(driveLetter.ToUpper());
    }
    
    /// <summary>
    /// Get the Windows User Profile path (e.g. C:\Users\Name)
    /// </summary>
    public async Task<string?> GetWindowsUserProfilePathAsync()
    {
        var result = await RunCommandAsync("cmd.exe", "/c \"echo %UserProfile%\"");
        if (result.exitCode == 0 && !string.IsNullOrWhiteSpace(result.output))
        {
            return result.output.Trim();
        }
        return null;
    }

    /// <summary>
    /// Check if a Windows drive exists (visible from Windows)
    /// </summary>
    private async Task<bool> CheckWindowsDriveExistsAsync(string driveLetter)
    {
        // Use cmd.exe to check if drive exists
        var result = await RunCommandAsync("cmd.exe", $"/c \"if exist {driveLetter}:\\ exit 0 else exit 1\"");
        return result.exitCode == 0;
    }
    
    /// <summary>
    /// Run a command with sudo, allowing interactive password prompt
    /// This method does NOT redirect stdin, allowing sudo to prompt for password
    /// </summary>
    private async Task<(int exitCode, string output, string error)> RunInteractiveSudoCommandAsync(string command, string arguments)
    {
        // Clear input buffer to ensure no stray keys interfere with sudo
        while (Console.KeyAvailable) 
        {
            Console.ReadKey(true);
        }

        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "sudo",
                Arguments = $"{command} {arguments}",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = false,  // IMPORTANT: Don't redirect stdin for password
                UseShellExecute = false,
                CreateNoWindow = false
            }
        };
        
        process.Start();
        
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        
        await process.WaitForExitAsync();
        
        var output = await outputTask;
        var error = await errorTask;
        
        return (process.ExitCode, output, error);
    }
    
    /// <summary>
    /// Run a command and capture output
    /// </summary>
    private async Task<(int exitCode, string output, string error)> RunCommandAsync(string command, string arguments)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };
        
        var outputBuilder = new StringBuilder();
        var errorBuilder = new StringBuilder();
        
        process.OutputDataReceived += (sender, e) =>
        {
            if (e.Data != null)
                outputBuilder.AppendLine(e.Data);
        };
        
        process.ErrorDataReceived += (sender, e) =>
        {
            if (e.Data != null)
                errorBuilder.AppendLine(e.Data);
        };
        
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        
        await process.WaitForExitAsync();
        
        return (process.ExitCode, outputBuilder.ToString(), errorBuilder.ToString());
    }
}
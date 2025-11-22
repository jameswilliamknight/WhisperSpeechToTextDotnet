using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Spectre.Console;
using Spectre.Console.Rendering;
using WhisperPrototype.Framework;

namespace WhisperPrototype.Framework.Models;

public class ModelManager
{
    private readonly string _modelsDirectory;
    private readonly AppSettings _appSettings;
    private readonly SettingsManager _settingsManager;
    private readonly string _modelsJsonPath;
    private List<ModelInfo>? _availableModels;

    // Hugging Face Repo API URL for file list
    private const string RemoteModelsUrl = "https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main";
    private const string BaseDownloadUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

    public ModelManager(string modelsDirectory, AppSettings appSettings, SettingsManager settingsManager)
    {
        _modelsDirectory = modelsDirectory;
        _appSettings = appSettings;
        _settingsManager = settingsManager;
        
        // Use ~/.config/whisper-prototype/models-cache.json
        var xdgConfigHome = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        var baseConfigDir = !string.IsNullOrEmpty(xdgConfigHome)
            ? xdgConfigHome
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config");
            
        _modelsJsonPath = Path.Combine(baseConfigDir, "whisper-prototype", "models-cache.json");
    }

    public async Task EnsureCacheExistsAsync()
    {
        if (!File.Exists(_modelsJsonPath))
        {
            await FetchRemoteModelsAsync(force: false);
        }
    }

    public async Task FetchRemoteModelsAsync(bool force = false)
    {
        // Check if cache is fresh enough (7 days)
        if (!force && File.Exists(_modelsJsonPath))
        {
            var lastWrite = File.GetLastWriteTime(_modelsJsonPath);
            if ((DateTime.Now - lastWrite).TotalDays < 7)
            {
                return; // Cache is fresh
            }
        }

        await AnsiConsole.Status()
            .StartAsync("Refreshing model list from Hugging Face...", async ctx =>
            {
                try
                {
                    using var client = new HttpClient();
                    client.DefaultRequestHeaders.UserAgent.ParseAdd("WhisperPrototype/1.0");
                    
                    var files = await client.GetFromJsonAsync<List<HfFile>>(RemoteModelsUrl);
                    
                    if (files != null)
                    {
                        var models = new List<ModelInfo>();
                        
                        // Filter for ggml-*.bin files, excluding quantized versions (q5, q8) to keep list clean
                        // unless they are the only option. Standard models usually don't have q* in name.
                        // e.g. ggml-base.bin, ggml-large-v3.bin
                        foreach (var file in files.Where(f => f.Path.EndsWith(".bin") && f.Path.StartsWith("ggml-")))
                        {
                            // Skip quantized variants for simplicity, unless user wants them. 
                            // Keeping it to standard f16/default models for now.
                            if (file.Path.Contains("-q5_") || file.Path.Contains("-q8_")) continue;

                            var name = file.Path.Replace("ggml-", "").Replace(".bin", "");
                            var description = GetDescriptionForModel(name);
                            
                            models.Add(new ModelInfo
                            {
                                Name = name,
                                Filename = file.Path,
                                Url = BaseDownloadUrl + file.Path,
                                Size = file.Size,
                                Sha256 = file.Lfs?.Oid ?? "", // LFS OID is usually the SHA256
                                Description = description,
                                Language = name.EndsWith(".en") ? "english" : "multilingual",
                                Recommended = name == "base" || name == "large-v3-turbo"
                            });
                        }

                        // Sort: Tiny -> Base -> Small -> Medium -> Large
                        var sortedModels = SortModels(models);
                        
                        var data = new ModelsData { Models = sortedModels };
                        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                        
                        // Ensure directory exists
                        var dir = Path.GetDirectoryName(_modelsJsonPath);
                        if (dir != null && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                        
                        await File.WriteAllTextAsync(_modelsJsonPath, json);
                        _availableModels = sortedModels;
                        
                        AnsiConsole.MarkupLine("[green]Model list refreshed successfully.[/]");
                    }
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[yellow]Failed to refresh models from remote: {ex.Message}[/]");
                    AnsiConsole.MarkupLine("[dim]Using cached or default models.[/]");
                    
                    if (!File.Exists(_modelsJsonPath))
                    {
                        // Create default fallback if no cache exists
                        await CreateDefaultCacheAsync();
                    }
                }
            });
    }

    private async Task CreateDefaultCacheAsync()
    {
        try 
        {
            var data = new ModelsData { Models = GetDefaultModels() };
            var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
            
            var dir = Path.GetDirectoryName(_modelsJsonPath);
            if (dir != null && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
            
            await File.WriteAllTextAsync(_modelsJsonPath, json);
            _availableModels = data.Models;
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Failed to create default cache: {ex.Message}[/]");
        }
    }

    public async Task ShowModelMenuAsync()
    {
        // Ensure we have models (refresh if needed/expired)
        await FetchRemoteModelsAsync(force: false);

        while (true)
        {
            AnsiConsole.Clear();
            AnsiConsole.Write(new Rule("[yellow]Speech Recognition Models[/]"));

            var models = await GetAvailableModelsAsync();
            if (models == null || models.Count == 0)
            {
                AnsiConsole.MarkupLine("[red]No models available.[/]");
                AnsiConsole.MarkupLine("[dim]Press any key to return...[/]");
                Console.ReadKey();
                return;
            }

            var currentModel = _appSettings.ActiveModelPath != null
                ? Path.GetFileNameWithoutExtension(_appSettings.ActiveModelPath)
                : "None";

            AnsiConsole.MarkupLine($"[grey]Current Active Model: {currentModel}[/]");
            AnsiConsole.MarkupLine($"[grey]Models Directory: {_modelsDirectory}[/]");
            AnsiConsole.WriteLine();

            var choices = new List<string>();
            var modelMap = new Dictionary<string, ModelInfo>();

            foreach (var model in models)
            {
                var modelPath = Path.Combine(_modelsDirectory, model.Filename);
                string statusIcon = "   "; // Default spacing (3 spaces)
                
                if (File.Exists(modelPath))
                {
                    var info = new FileInfo(modelPath);
                    if (info.Length == model.Size)
                    {
                        // Checkmark is usually 1 char wide, so add 2 spaces to match 3-char width
                        statusIcon = "[green]✓[/]  ";
                    }
                    else
                    {
                        // Pause symbol is usually 2 chars wide (emoji), so add 1 space to match 3-char width
                        statusIcon = "[yellow]⏸ [/] ";
                    }
                }

                var display = $"{statusIcon}{model.Name} ({model.Description})";
                choices.Add(display);
                modelMap[display] = model;
            }
            
            choices.Add("Go Back");

            var choice = AnsiConsole.Prompt(
                new SelectionPrompt<string>()
                    .Title("Select a model to download/install or manage:")
                    .AddChoices(choices));

            if (choice == "Go Back") break;

            var selectedModel = modelMap[choice];
            await HandleModelSelectionAsync(selectedModel);
        }
    }

    private async Task<List<ModelInfo>?> GetAvailableModelsAsync()
    {
        if (_availableModels != null) return _availableModels;

        try
        {
            if (!File.Exists(_modelsJsonPath))
            {
                // Should have been created by EnsureCache/Fetch, but just in case
                await CreateDefaultCacheAsync();
            }

            var json = await File.ReadAllTextAsync(_modelsJsonPath);
            var modelsData = JsonSerializer.Deserialize<ModelsData>(json);
            _availableModels = modelsData?.Models ?? new List<ModelInfo>();
            return _availableModels;
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error loading models: {ex.Message}[/]");
            return new List<ModelInfo>();
        }
    }

    private async Task HandleModelSelectionAsync(ModelInfo model)
    {
        var modelPath = Path.Combine(_modelsDirectory, model.Filename);
        var isDownloaded = File.Exists(modelPath) && new FileInfo(modelPath).Length == model.Size;

        if (isDownloaded)
        {
            // Model is already downloaded
            var choice = AnsiConsole.Prompt(
                new SelectionPrompt<string>()
                    .Title($"Model '{model.Name}' is already downloaded.")
                    .AddChoices("Set as Active Model", "Delete Model", "Go Back"));

            switch (choice)
            {
                case "Set as Active Model":
                    _appSettings.ActiveModelPath = modelPath;
                    await _settingsManager.SaveSettingsAsync();
                    AnsiConsole.MarkupLine($"[green]Set '{model.Name}' as active model.[/]");
                    await Task.Delay(1000);
                    break;
                case "Delete Model":
                    if (AnsiConsole.Confirm($"[red]Are you sure you want to delete '{model.Name}'?[/]"))
                    {
                        File.Delete(modelPath);
                        if (_appSettings.ActiveModelPath == modelPath)
                        {
                            _appSettings.ActiveModelPath = null;
                            await _settingsManager.SaveSettingsAsync();
                        }
                        AnsiConsole.MarkupLine($"[green]Deleted '{model.Name}'.[/]");
                        await Task.Delay(1000);
                    }
                    break;
            }
        }
        else
        {
            // Model needs to be downloaded or resumed
            if (File.Exists(modelPath))
            {
                // Partial download: Auto-resume
                await DownloadModelAsync(model);
            }
            else
            {
                // New download: Confirm
                if (AnsiConsole.Confirm($"Download '{model.Name}' ({FormatSize(model.Size)})?"))
                {
                    await DownloadModelAsync(model);
                }
            }
        }
    }

    private async Task DownloadModelAsync(ModelInfo model)
    {
        var modelPath = Path.Combine(_modelsDirectory, model.Filename);
        long existingSize = 0;
        bool resume = false;

        if (File.Exists(modelPath))
        {
            var fi = new FileInfo(modelPath);
            existingSize = fi.Length;
            
            if (existingSize < model.Size)
            {
                // Partial download: Auto-resume
                resume = true;
            }
            else if (existingSize > model.Size)
            {
                // Corrupt/Larger? Delete and restart
                File.Delete(modelPath);
                existingSize = 0;
            }
            // If equal, it should have been handled by HandleModelSelectionAsync, but just in case:
            else if (existingSize == model.Size)
            {
                AnsiConsole.MarkupLine("[green]Model already downloaded.[/]");
                return;
            }
        }

        try
        {
            if (!Directory.Exists(_modelsDirectory)) Directory.CreateDirectory(_modelsDirectory);

            using var client = new HttpClient();
            
            if (resume)
            {
                client.DefaultRequestHeaders.Range = new System.Net.Http.Headers.RangeHeaderValue(existingSize, null);
                AnsiConsole.MarkupLine($"[cyan]Resuming {model.Name} from {FormatSize(existingSize)}...[/]");
            }
            else
            {
                if (File.Exists(modelPath)) File.Delete(modelPath);
                existingSize = 0;
                AnsiConsole.MarkupLine($"[cyan]Downloading {model.Name}...[/]");
            }

            var response = await client.GetAsync(model.Url, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            var totalBytes = model.Size; // Use model size as total, response.Content.Length will be remaining bytes if partial
            using var stream = await response.Content.ReadAsStreamAsync();
            using var fileStream = new FileStream(modelPath, resume ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None);

            var buffer = new byte[8192];
            var totalRead = existingSize;
            int bytesRead;

            await AnsiConsole.Progress()
                .Columns(new ProgressColumn[] 
                {
                    new TaskDescriptionColumn(),    // Task name
                    new SpacerColumn(),
                    new ProgressBarColumn(),        // Progress bar
                    new SpacerColumn(),
                    new PercentageColumn(),         // Percentage
                    new SpacerColumn(),
                    new DownloadedColumn(),         // Downloaded size
                    new SpacerColumn(),
                    new TransferSpeedColumn(),      // Transfer speed
                    new SpacerColumn(),
                    new RemainingTimeColumn(),      // Remaining time
                    new SpacerColumn(),
                    new SpinnerColumn(),            // Spinner
                })
                .StartAsync(async ctx =>
                {
                    var task = ctx.AddTask($"Downloading {model.Name}", maxValue: totalBytes);
                    task.Value = totalRead;

                    while ((bytesRead = await stream.ReadAsync(buffer)) > 0)
                    {
                        await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead));
                        totalRead += bytesRead;
                        task.Value = totalRead;
                    }
                });

            AnsiConsole.MarkupLine($"[green]Downloaded '{model.Name}' successfully.[/]");
            await Task.Delay(1000);
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Failed to download '{model.Name}': {ex.Message}[/]");
            // Do not delete on failure to allow resume later
            await Task.Delay(2000);
        }
    }

    private string FormatSize(long bytes)
    {
        string[] sizes = { "B", "KB", "MB", "GB" };
        int order = 0;
        double size = bytes;
        while (size >= 1024 && order < sizes.Length - 1)
        {
            order++;
            size /= 1024;
        }
        return $"{size:0.##} {sizes[order]}";
    }

    private List<ModelInfo> SortModels(List<ModelInfo> models)
    {
        var order = new List<string> { "tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large-v1", "large-v2", "large-v3", "large-v3-turbo" };
        return models.OrderBy(m => 
        {
            var index = order.IndexOf(m.Name);
            return index == -1 ? 999 : index;
        }).ToList();
    }

    private string GetDescriptionForModel(string name)
    {
        return name switch
        {
            "tiny" => "Fastest, lowest accuracy",
            "tiny.en" => "English-only, fastest",
            "base" => "Good balance, recommended",
            "base.en" => "English-only, good balance",
            "small" => "Better accuracy",
            "small.en" => "English-only, better accuracy",
            "medium" => "High accuracy",
            "medium.en" => "English-only, high accuracy",
            "large-v1" => "Legacy large model",
            "large-v2" => "Improved large model",
            "large-v3" => "Best accuracy (current)",
            "large-v3-turbo" => "Best balance (newest, Oct 2024)",
            _ => "Whisper model"
        };
    }

    private List<ModelInfo> GetDefaultModels()
    {
        return new List<ModelInfo>
        {
            new() { Name = "tiny", Filename = "ggml-tiny.bin", Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin", Size = 78538688, Description = "Fastest, lowest accuracy", Language = "multilingual" },
            new() { Name = "base", Filename = "ggml-base.bin", Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", Size = 147964211, Description = "Good balance, recommended", Language = "multilingual", Recommended = true },
            new() { Name = "small", Filename = "ggml-small.bin", Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", Size = 488652231, Description = "Better accuracy", Language = "multilingual" },
            new() { Name = "medium", Filename = "ggml-medium.bin", Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin", Size = 1533841291, Description = "High accuracy", Language = "multilingual" },
            new() { Name = "large-v3", Filename = "ggml-large-v3.bin", Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin", Size = 3094102783, Description = "Best accuracy (current)", Language = "multilingual" },
            new() { Name = "large-v3-turbo", Filename = "ggml-large-v3-turbo.bin", Url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin", Size = 1620141057, Description = "Best balance (newest, Oct 2024)", Language = "multilingual", Recommended = true }
        };
    }
}

public class ModelInfo
{
    public string Name { get; set; } = string.Empty;
    public string Filename { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public long Size { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public bool Recommended { get; set; }
}

public class ModelsData
{
    public List<ModelInfo> Models { get; set; } = new();
}

// Helper classes for HF API
public class HfFile
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;
    
    [JsonPropertyName("size")]
    public long Size { get; set; }
    
    [JsonPropertyName("lfs")]
    public HfLfsInfo? Lfs { get; set; }
}

public class HfLfsInfo
{
    [JsonPropertyName("oid")]
    public string Oid { get; set; } = string.Empty;
}

public sealed class SpacerColumn : ProgressColumn
{
    private readonly int _width;

    public SpacerColumn(int width = 2)
    {
        _width = width;
    }

    public override IRenderable Render(RenderOptions options, ProgressTask task, TimeSpan deltaTime)
    {
        return new Text(new string(' ', _width));
    }
}

namespace WhisperPrototype.Framework.Stitching;

/// <summary>
/// Provides fuzzy string matching using Levenshtein distance to handle
/// transcription inconsistencies where the same audio produces similar but not identical words.
/// </summary>
public static class FuzzyMatcher
{
    /// <summary>
    /// Calculates the Levenshtein distance between two strings.
    /// This represents the minimum number of single-character edits needed to transform one string into another.
    /// </summary>
    public static int LevenshteinDistance(string source, string target)
    {
        if (string.IsNullOrEmpty(source))
            return target?.Length ?? 0;
        
        if (string.IsNullOrEmpty(target))
            return source.Length;
        
        int sourceLength = source.Length;
        int targetLength = target.Length;
        
        // Create a 2D array to store distances
        int[,] distance = new int[sourceLength + 1, targetLength + 1];
        
        // Initialize first column and row
        for (int i = 0; i <= sourceLength; i++)
            distance[i, 0] = i;
        
        for (int j = 0; j <= targetLength; j++)
            distance[0, j] = j;
        
        // Calculate distances
        for (int i = 1; i <= sourceLength; i++)
        {
            for (int j = 1; j <= targetLength; j++)
            {
                int cost = (source[i - 1] == target[j - 1]) ? 0 : 1;
                
                distance[i, j] = Math.Min(
                    Math.Min(
                        distance[i - 1, j] + 1,      // deletion
                        distance[i, j - 1] + 1),     // insertion
                    distance[i - 1, j - 1] + cost);  // substitution
            }
        }
        
        return distance[sourceLength, targetLength];
    }
    
    /// <summary>
    /// Calculates similarity between two strings as a percentage (0.0 to 1.0).
    /// 1.0 means identical, 0.0 means completely different.
    /// </summary>
    public static double CalculateSimilarity(string source, string target)
    {
        if (string.IsNullOrEmpty(source) && string.IsNullOrEmpty(target))
            return 1.0;
        
        if (string.IsNullOrEmpty(source) || string.IsNullOrEmpty(target))
            return 0.0;
        
        int distance = LevenshteinDistance(source, target);
        int maxLength = Math.Max(source.Length, target.Length);
        
        return 1.0 - ((double)distance / maxLength);
    }
    
    /// <summary>
    /// Checks if two words are similar enough based on a threshold.
    /// </summary>
    /// <param name="word1">First word to compare</param>
    /// <param name="word2">Second word to compare</param>
    /// <param name="threshold">Similarity threshold (0.0 to 1.0), default 0.85</param>
    /// <returns>True if words are similar enough</returns>
    public static bool AreSimilar(string word1, string word2, double threshold = 0.85)
    {
        if (string.Equals(word1, word2, StringComparison.OrdinalIgnoreCase))
            return true;
        
        double similarity = CalculateSimilarity(word1, word2);
        return similarity >= threshold;
    }
    
    /// <summary>
    /// Finds the best matching word from a list based on similarity.
    /// </summary>
    public static (string? match, double similarity) FindBestMatch(string target, IEnumerable<string> candidates, double minThreshold = 0.85)
    {
        string? bestMatch = null;
        double bestSimilarity = 0.0;
        
        foreach (var candidate in candidates)
        {
            double similarity = CalculateSimilarity(target, candidate);
            if (similarity > bestSimilarity && similarity >= minThreshold)
            {
                bestSimilarity = similarity;
                bestMatch = candidate;
            }
        }
        
        return (bestMatch, bestSimilarity);
    }
}


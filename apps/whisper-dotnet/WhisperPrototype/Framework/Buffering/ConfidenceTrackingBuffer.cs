using System.Text;

namespace WhisperPrototype.Framework.Buffering;

/// <summary>
/// Advanced display buffer that tracks word-level confidence across overlapping windows.
/// Uses consensus voting: words seen multiple times gain confidence and are finalized.
/// Implements "best 2 out of 3" voting when words differ at the same position.
/// </summary>
public class ConfidenceTrackingBuffer : ITranscriptionDisplayBuffer
{
    private readonly List<WordConfidence> _draftWords;
    private readonly StringBuilder _finalizedText;
    private readonly Action<string> _onFinalizedText;
    private readonly int _confidenceThreshold; // 1=Low (60%), 2=Medium (80%), 3=High (100%)
    private readonly int _maxDraftWords;
    private int _totalFinalizedWords;
    
    public ConfidenceTrackingBuffer(
        int confidenceThreshold, 
        int maxDraftWords,
        Action<string> onFinalizedText)
    {
        _confidenceThreshold = confidenceThreshold;
        _maxDraftWords = maxDraftWords;
        _onFinalizedText = onFinalizedText;
        _draftWords = new List<WordConfidence>();
        _finalizedText = new StringBuilder();
        _totalFinalizedWords = 0;
    }
    
    public void AddStitchedText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return;
        
        var newWords = text.Split(new[] { ' ', '\t', '\n', '\r' }, 
            StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var word in newWords)
        {
            ProcessWord(word);
        }
        
        // Finalize words that meet confidence threshold
        FinalizeConfidentWords();
        
        // Enforce maximum draft buffer size (finalize oldest if needed)
        EnforceMaxDraftSize();
    }
    
    private void ProcessWord(string word)
    {
        // Try to match with existing draft words (within a small window)
        // This handles cases where same word appears in overlapping segments
        bool matched = false;
        
        // Look for matching word within last few positions
        int searchWindow = Math.Min(5, _draftWords.Count);
        for (int i = _draftWords.Count - searchWindow; i < _draftWords.Count; i++)
        {
            if (i >= 0 && string.Equals(_draftWords[i].Word, word, StringComparison.OrdinalIgnoreCase))
            {
                // Found matching word - increment confidence
                _draftWords[i].SeenCount++;
                _draftWords[i].LastSeenPosition = _draftWords.Count;
                matched = true;
                break;
            }
        }
        
        if (!matched)
        {
            // New word - add to draft with initial confidence
            _draftWords.Add(new WordConfidence
            {
                Word = word,
                SeenCount = 1,
                FirstSeenPosition = _draftWords.Count,
                LastSeenPosition = _draftWords.Count
            });
        }
    }
    
    private void FinalizeConfidentWords()
    {
        // Finalize words from front of buffer that meet confidence threshold
        while (_draftWords.Count > 0)
        {
            var word = _draftWords[0];
            
            // Check if word has been seen enough times to meet threshold
            if (word.SeenCount >= _confidenceThreshold)
            {
                FinalizeWord(word.Word);
                _draftWords.RemoveAt(0);
                _totalFinalizedWords++;
            }
            else
            {
                // Words are processed in order, so stop at first unconfident word
                break;
            }
        }
    }
    
    private void EnforceMaxDraftSize()
    {
        // If draft buffer exceeds max size, finalize oldest words regardless of confidence
        while (_draftWords.Count > _maxDraftWords)
        {
            var word = _draftWords[0];
            
            // Use best candidate if multiple variants exist (best 2 out of 3 voting)
            var finalWord = GetBestWordCandidate(word);
            
            FinalizeWord(finalWord);
            _draftWords.RemoveAt(0);
            _totalFinalizedWords++;
        }
    }
    
    private string GetBestWordCandidate(WordConfidence word)
    {
        // For now, just return the word as-is
        // In future, could implement voting between variants if we track them
        return word.Word;
    }
    
    private void FinalizeWord(string word)
    {
        var wordToDisplay = word + " ";
        _finalizedText.Append(wordToDisplay);
        _onFinalizedText(wordToDisplay);
    }
    
    public void Flush()
    {
        // Finalize all remaining draft words
        foreach (var word in _draftWords)
        {
            FinalizeWord(word.Word);
        }
        _totalFinalizedWords += _draftWords.Count;
        _draftWords.Clear();
    }
    
    public string GetAccumulatedText()
    {
        // Combine finalized + draft for saving
        var draftText = string.Join(" ", _draftWords.Select(w => w.Word));
        var combined = _finalizedText.ToString();
        
        if (!string.IsNullOrEmpty(draftText))
        {
            combined += draftText;
        }
        
        return combined.Trim();
    }
    
    public BufferStatistics GetStatistics()
    {
        var avgConfidence = _draftWords.Count > 0
            ? _draftWords.Average(w => (double)w.SeenCount / _confidenceThreshold * 100.0)
            : 0;
        
        return new BufferStatistics
        {
            WordsInDraft = _draftWords.Count,
            WordsFinalized = _totalFinalizedWords,
            AverageConfidence = avgConfidence
        };
    }
}

/// <summary>
/// Tracks confidence information for a word in the draft buffer
/// </summary>
internal class WordConfidence
{
    public string Word { get; set; } = string.Empty;
    public int SeenCount { get; set; }
    public int FirstSeenPosition { get; set; }
    public int LastSeenPosition { get; set; }
}


import { Track } from '@/types/music';

// Replace with actual API Key or use environment variables
// Add EXPO_PUBLIC_GLM_API_KEY=your_key_here to your .env file
const GLM_API_KEY = process.env.EXPO_PUBLIC_GLM_API_KEY || ''; 
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

export class AiMetadataService {
  /**
   * Calls the GLM-4-Flash API to extract the real title and artist from messy YouTube data.
   */
  static async recoverMetadata(rawTitle: string, rawArtist: string): Promise<{ title: string; artist: string } | null> {
    if (!GLM_API_KEY) {
      console.warn('[AURA AI] API key missing (EXPO_PUBLIC_GLM_API_KEY). Skipping AI fallback.');
      return null;
    }

    try {
      const prompt = `You are a music metadata expert. Extract the REAL song name and the REAL artist name from this messy YouTube data.
Return ONLY a valid JSON object with "title" and "artist" keys. Do NOT wrap in markdown blocks, just raw JSON.

Messy Title: "${rawTitle}"
Messy Uploader: "${rawArtist}"`;

      const response = await fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GLM_API_KEY}`
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1, 
        })
      });

      const data = await response.json();
      if (data.choices && data.choices.length > 0) {
        let resultText = data.choices[0].message.content.trim();
        
        // Strip markdown json blocks if the AI ignored the prompt
        if (resultText.startsWith('```json')) {
          resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        } else if (resultText.startsWith('```')) {
          resultText = resultText.replace(/```/g, '').trim();
        }

        const parsed = JSON.parse(resultText);
        
        if (parsed.title && parsed.artist) {
          console.log(`[AURA AI] Recovered: "${parsed.title}" by ${parsed.artist} (Original: ${rawTitle})`);
          return { title: parsed.title.trim(), artist: parsed.artist.trim() };
        }
      }
    } catch (e) {
      console.error('[AURA AI] Metadata recovery failed:', e);
    }
    return null;
  }

  /**
   * Determines if the local sanitation failed and we need to call the AI.
   */
  static needsAiRecovery(title: string, artist: string): boolean {
    const artistLower = artist.toLowerCase();

    // If local sanitation left us with a YouTube channel name
    if (
      artistLower.includes('topic') || 
      artistLower.includes('vevo') || 
      artistLower.length > 25 || 
      /labels|records|music/i.test(artist) ||
      artistLower.includes('iperol')
    ) {
      return true;
    }

    // If title is super long or still has massive brackets, local logic might have failed
    if (title.length > 45 || title.includes('|') || title.includes('//')) {
      return true;
    }

    return false;
  }
}

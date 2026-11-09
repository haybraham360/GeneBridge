# Listen (read aloud)

Every Listen button, the report scanner's narration and spoken assistant replies go through `lib/audio/tts.ts`. It plays natural cloud voices when a provider is set up, and otherwise uses the browser's built-in speech. Captions follow sentence by sentence either way.

| Setting | Voice |
|---|---|
| Nothing set (default) | The browser's speech. It picks the most natural voice installed (Edge "Natural", Safari "Premium"/"Enhanced", Chrome "Google") and avoids robotic ones |
| `TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY` | ElevenLabs. Default voice "Sarah" for both languages, model `eleven_multilingual_v2` |
| `TTS_PROVIDER=azure`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Azure neural voices: Gulf Arabic `ar-AE-FatimaNeural` and `en-GB-SoniaNeural`. Use region `uaenorth` to keep processing in the UAE |

Optional overrides: `TTS_VOICE_AR` and `TTS_VOICE_EN` (an ElevenLabs voice ID or an Azure voice name) and `TTS_MODEL` (ElevenLabs only; `eleven_flash_v2_5` uses half the credits).

## Getting an ElevenLabs key

1. Sign up at elevenlabs.io (no card needed for the free plan).
2. **Developers → API Keys → Create API key.**
3. Add `TTS_PROVIDER=elevenlabs` and `ELEVENLABS_API_KEY=<key>` to `.env.local`, and to Vercel for production (then redeploy).

The free plan has about 10,000 characters a month, allows 2 requests at a time (the route respects this) and isn't licensed for commercial use. Move to a paid plan before real patients use it.

## How it works

- `/api/tts` (signed-in users only) synthesises one audio file per sentence and stores it in the private `tts-cache` bucket under the user's own folder, keyed by provider, voice and sentence. Replays within 24 hours cost nothing; the sweep deletes older files.
- If the provider fails or runs out of quota, the app quietly falls back to the browser's speech.

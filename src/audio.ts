let context: AudioContext | undefined;

export async function playTone(kind: 'slide' | 'blocked' | 'win'): Promise<void> {
  context ??= new AudioContext();
  if (context.state === 'suspended') await context.resume();
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = 'sine';
  const frequency = kind === 'blocked' ? 130 : kind === 'win' ? 520 : 340;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === 'blocked' ? 0.6 : 1.7), now + 0.18);
  volume.gain.setValueAtTime(0, now);
  volume.gain.linearRampToValueAtTime(0.055, now + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
}

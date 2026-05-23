import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { getDB } from '../db/database';

export interface ShieldReading { takenAt: Date; bpm: number; rmssd: number; }
export interface ShieldResult {
  shieldMinutes: number;
  returnedToBaselineAt: Date | null;
  samples: ShieldReading[];
  message: string;
}

/**
 * Post-session HRV decay tracker.
 *   • 120-minute hard ceiling
 *   • Sample HRV every 5 minutes
 *   • Exits early when HRV drops back into tolerance (+5%) of baseline
 */
export class SpiritualShieldEngine {
  private readonly MAX_MIN = 120;
  private readonly SAMPLING_MIN = 5;
  private readonly TOLERANCE_PCT = 5;

  private timer: ReturnType<typeof setInterval> | null = null;
  private samples: ShieldReading[] = [];
  private startedAt = new Date();
  private baselineRmssd = 0;

  constructor(
    private sessionId: string,
    private sampler: () => Promise<ShieldReading>,
    private onComplete: (r: ShieldResult) => void
  ) {}

  async start(): Promise<void> {
    const { avgRmssd } = await ambientBaselineRepo.rollingAvg(30);
    this.baselineRmssd = avgRmssd || 1;
    this.startedAt = new Date();
    this.samples = [];

    await this.tick();
    this.timer = setInterval(() => this.tick(), this.SAMPLING_MIN * 60_000);
  }

  private async tick(): Promise<void> {
    const elapsedMs = Date.now() - this.startedAt.getTime();
    const reading = await this.sampler();
    this.samples.push(reading);

    const tolerance = this.baselineRmssd * (1 + this.TOLERANCE_PCT / 100);
    const returnedToBaseline = reading.rmssd <= tolerance;
    const timeUp = elapsedMs >= this.MAX_MIN * 60_000;

    if (returnedToBaseline || timeUp) {
      await this.finish(returnedToBaseline ? reading.takenAt : null);
    }
  }

  private async finish(returnedAt: Date | null): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const last = this.samples[this.samples.length - 1];
    const endTime = returnedAt ?? last?.takenAt ?? new Date();
    const shieldMinutes = Math.round((endTime.getTime() - this.startedAt.getTime()) / 60_000);
    const hours = (shieldMinutes / 60).toFixed(1);

    const db = await getDB();
    await db.runAsync(
      `INSERT INTO shield_event
        (session_id, started_at, ended_at, shield_minutes, returned_to_baseline)
       VALUES (?, ?, ?, ?, ?)`,
      [this.sessionId, this.startedAt.toISOString(), endTime.toISOString(),
       shieldMinutes, returnedAt ? 1 : 0]
    );

    this.onComplete({
      shieldMinutes,
      returnedToBaselineAt: returnedAt,
      samples: this.samples,
      message: `Your morning Japa protected your body from physical stress for ${hours} hours.`,
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

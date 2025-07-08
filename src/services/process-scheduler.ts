import { CronJob } from 'cron';
import { logger } from '../utils/logger';
import { ProcessConfig } from '../types';

export interface ScheduledProcess {
  id: string;
  config: ProcessConfig;
  cronJob: CronJob;
  lastRun: Date | null;
  nextRun: Date | null;
  isRunning: boolean;
  runCount: number;
  lastError: string | null;
}

export class ProcessScheduler {
  private scheduledProcesses: Map<string, ScheduledProcess> = new Map();
  private onProcessStart: ((id: string, config: ProcessConfig) => Promise<void>) | null = null;
  private onProcessStop: ((id: string) => Promise<void>) | null = null;
  private onProcessStatusChange: ((id: string, isRunning: boolean) => void) | null = null;

  constructor() {
    logger.info('Process scheduler initialized');
  }

  /**
   * Set callback for starting processes
   */
  public setProcessStartCallback(callback: (id: string, config: ProcessConfig) => Promise<void>): void {
    this.onProcessStart = callback;
  }

  /**
   * Set callback for stopping processes
   */
  public setProcessStopCallback(callback: (id: string) => Promise<void>): void {
    this.onProcessStop = callback;
  }

  /**
   * Set callback for process status changes
   */
  public setProcessStatusChangeCallback(callback: (id: string, isRunning: boolean) => void): void {
    this.onProcessStatusChange = callback;
  }

  /**
   * Schedule a process based on its configuration
   */
  public scheduleProcess(id: string, config: ProcessConfig): boolean {
    if (!config.schedule?.enabled || !config.schedule.cron) {
      logger.debug(`Process ${id} has no schedule or scheduling is disabled`);
      return false;
    }

    try {
      // Stop existing schedule if any
      this.unscheduleProcess(id);

      const cronExpression = config.schedule.cron;
      const timezone = config.schedule.timezone || 'UTC';

      logger.info(`Scheduling process ${id} with cron: ${cronExpression} (timezone: ${timezone})`);

      const cronJob = new CronJob(
        cronExpression,
        () => this.executeScheduledProcess(id, config),
        null,
        false,
        timezone
      );

      const scheduledProcess: ScheduledProcess = {
        id,
        config,
        cronJob,
        lastRun: null,
        nextRun: cronJob.nextDate().toJSDate(),
        isRunning: false,
        runCount: 0,
        lastError: null
      };

      this.scheduledProcesses.set(id, scheduledProcess);
      cronJob.start();

      logger.info(`Process ${id} scheduled successfully. Next run: ${scheduledProcess.nextRun}`);

      return true;
    } catch (error) {
      logger.error(`Failed to schedule process ${id}`, error);
      return false;
    }
  }

  /**
   * Execute a scheduled process
   */
  private async executeScheduledProcess(id: string, config: ProcessConfig): Promise<void> {
    const scheduledProcess = this.scheduledProcesses.get(id);
    if (!scheduledProcess) {
      logger.warn(`Scheduled process ${id} not found`);
      return;
    }

    // Check if process is already running and skip if configured
    if (config.schedule?.skipIfRunning && scheduledProcess.isRunning) {
      logger.info(`Skipping scheduled execution of ${id} - process is already running`);
      return;
    }

    try {
      logger.info(`Executing scheduled process ${id}`);

      scheduledProcess.isRunning = true;
      scheduledProcess.lastRun = new Date();
      scheduledProcess.runCount++;
      scheduledProcess.lastError = null;

      // Notify status change
      if (this.onProcessStatusChange) {
        this.onProcessStatusChange(id, true);
      }

      // Start the process
      if (this.onProcessStart) {
        await this.onProcessStart(id, config);
      }

      // Set up auto-stop if configured
      if (config.schedule?.autoStop && config.schedule?.maxDuration) {
        setTimeout(async () => {
          logger.info(`Auto-stopping scheduled process ${id} after ${config.schedule!.maxDuration}ms`);
          if (this.onProcessStop) {
            await this.onProcessStop(id);
          }
          scheduledProcess.isRunning = false;
          if (this.onProcessStatusChange) {
            this.onProcessStatusChange(id, false);
          }
        }, config.schedule.maxDuration);
      }

      // Update next run time
      scheduledProcess.nextRun = scheduledProcess.cronJob.nextDate().toJSDate();

    } catch (error) {
      logger.error(`Error executing scheduled process ${id}`, error);
      scheduledProcess.lastError = error instanceof Error ? error.message : String(error);
      scheduledProcess.isRunning = false;

      if (this.onProcessStatusChange) {
        this.onProcessStatusChange(id, false);
      }
    }
  }

  /**
   * Unschedule a process
   */
  public unscheduleProcess(id: string): boolean {
    const scheduledProcess = this.scheduledProcesses.get(id);
    if (!scheduledProcess) {
      return false;
    }

    try {
      scheduledProcess.cronJob.stop();
      this.scheduledProcesses.delete(id);
      logger.info(`Unscheduled process ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error unscheduling process ${id}`, error);
      return false;
    }
  }

  /**
   * Update process running status (called by process manager)
   */
  public updateProcessStatus(id: string, isRunning: boolean): void {
    const scheduledProcess = this.scheduledProcesses.get(id);
    if (scheduledProcess) {
      scheduledProcess.isRunning = isRunning;
    }
  }

  /**
   * Get all scheduled processes
   */
  public getScheduledProcesses(): ScheduledProcess[] {
    return Array.from(this.scheduledProcesses.values());
  }

  /**
   * Get a specific scheduled process
   */
  public getScheduledProcess(id: string): ScheduledProcess | undefined {
    return this.scheduledProcesses.get(id);
  }

  /**
   * Validate a cron expression
   */
  public validateCronExpression(cronExpression: string): boolean {
    try {
      new CronJob(cronExpression, () => { }, null, false);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get next run time for a cron expression
   */
  public getNextRunTime(cronExpression: string, timezone: string = 'UTC'): Date | null {
    try {
      const cronJob = new CronJob(cronExpression, () => { }, null, false, timezone);
      return cronJob.nextDate().toJSDate();
    } catch (error) {
      return null;
    }
  }

  /**
   * Shutdown the scheduler
   */
  public shutdown(): void {
    logger.info('Shutting down process scheduler');

    for (const [id, scheduledProcess] of this.scheduledProcesses) {
      try {
        scheduledProcess.cronJob.stop();
        logger.debug(`Stopped scheduled process ${id}`);
      } catch (error) {
        logger.error(`Error stopping scheduled process ${id}`, error);
      }
    }

    this.scheduledProcesses.clear();
  }

  /**
   * Clear all scheduled processes
   */
  public clearSchedules(): void {
    logger.info('Clearing all scheduled processes');

    for (const [id, scheduledProcess] of this.scheduledProcesses) {
      try {
        scheduledProcess.cronJob.stop();
      } catch (error) {
        logger.error(`Error stopping cron job for process ${id}`, error);
      }
    }

    this.scheduledProcesses.clear();
    logger.info('All scheduled processes cleared');
  }
} 
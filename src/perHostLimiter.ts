// perHostLimiter.ts
class Semaphore {
    private available: number;
    private queue: Array<() => void> = [];

    constructor(max: number) {
        this.available = max;
    }

    async acquire(): Promise<void> {
        if (this.available > 0) {
            this.available -= 1;
            return;
        }
        await new Promise<void>(resolve => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        this.available += 1;
        const next = this.queue.shift();
        if (this.available > 0 && next) {
            this.available -= 1;
            next();
        }
    }
}

export class PerHostLimiter {
    private locks = new Map<string, Semaphore>();
    private maxPerHost: number;

    constructor(maxPerHost: number) {
        this.maxPerHost = maxPerHost;
    }

    private getLock(host: string): Semaphore {
        let lock = this.locks.get(host);
        if (!lock) {
            lock = new Semaphore(this.maxPerHost);
            this.locks.set(host, lock);
        }
        return lock;
    }

    async acquire(host: string): Promise<void> {
        const lock = this.getLock(host);
        await lock.acquire();
    }

    release(host: string): void {
        const lock = this.getLock(host);
        lock.release();
    }
}

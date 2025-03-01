class ProgressService {
    constructor() {
        this.progress = {
            total: 0,
            processed: 0,
            percent: 0
        };
        this.listeners = new Set();
    }

    updateProgress(processed, total) {
        this.progress = {
            total,
            processed,
            percent: Math.round((processed / total) * 100)
        };
        this.notifyListeners();
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners() {
        this.listeners.forEach(callback => callback(this.progress));
    }

    reset() {
        this.progress = {
            total: 0,
            processed: 0,
            percent: 0
        };
        this.notifyListeners();
    }
}

module.exports = new ProgressService();

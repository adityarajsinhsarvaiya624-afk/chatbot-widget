const info = (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
};

const error = (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
};

const debug = (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] ${message}`, ...args);
    }
};

module.exports = { info, error, debug };

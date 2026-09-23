const winston = require('winston');
const { combine, timestamp, colorize, printf } = winston.format;

const fmt = printf(({ timestamp, level, message }) =>
  `[${timestamp}] ${level}: ${message}`
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), colorize(), fmt),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = logger;

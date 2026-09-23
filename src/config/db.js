const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    logger.error('MONGO_URI is not set. Add it to your .env file (see .env.example).');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    await require('../utils/migrateQuotationStatuses')();
  } catch (error) {
    // Never log error.message verbatim here if it could echo the connection
    // string (some driver errors include it) - log a generic reason instead.
    logger.error('MongoDB connection failed. Check MONGO_URI and that the database is reachable.');
    process.exit(1);
  }
};

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB runtime error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.error('MongoDB disconnected.');
});

module.exports = connectDB;

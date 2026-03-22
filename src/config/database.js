const { Sequelize } = require('sequelize');

let sequelize;
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres', logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'voip_crm',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'password',
    { host: process.env.DB_HOST || 'localhost', port: 5432, dialect: 'postgres', logging: false }
  );
}
module.exports = sequelize;

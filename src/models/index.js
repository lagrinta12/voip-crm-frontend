const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'agent'), defaultValue: 'agent' }
});

const Client = sequelize.define('Client', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, unique: true, allowNull: false },
  email: { type: DataTypes.STRING, unique: true },
  address: { type: DataTypes.STRING }
});

const Call = sequelize.define('Call', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  agentId: { type: DataTypes.INTEGER, allowNull: false },
  clientId: { type: DataTypes.INTEGER, allowNull: false },
  duration: { type: DataTypes.INTEGER, defaultValue: 0 }, // in seconds
  startTime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  endTime: { type: DataTypes.DATE },
  status: { type: DataTypes.ENUM('ringing', 'in-progress', 'completed', 'missed'), defaultValue: 'ringing' },
  notes: { type: DataTypes.TEXT }
});

const Tag = sequelize.define('Tag', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, unique: true, allowNull: false }
});

// Associations
User.hasMany(Call, { foreignKey: 'agentId' });
Call.belongsTo(User, { foreignKey: 'agentId' });

Client.hasMany(Call, { foreignKey: 'clientId' });
Call.belongsTo(Client, { foreignKey: 'clientId' });

Call.belongsToMany(Tag, { through: 'CallTags' });
Tag.belongsToMany(Call, { through: 'CallTags' });

module.exports = {
  sequelize,
  User,
  Client,
  Call,
  Tag
};

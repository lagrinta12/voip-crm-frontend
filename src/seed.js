const bcrypt = require('bcryptjs');
const { User, Client, Call, Tag } = require('./models');

const seedDatabase = async () => {
  try {
    // Create admin user
    const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
    await User.findOrCreate({
      where: { username: 'admin' },
      defaults: { password: hashedPasswordAdmin, role: 'admin' }
    });
    console.log('Admin user seeded');

    // Create agent user
    const hashedPasswordAgent = await bcrypt.hash('agent123', 10);
    await User.findOrCreate({
      where: { username: 'agent1' },
      defaults: { password: hashedPasswordAgent, role: 'agent' }
    });
    console.log('Agent user seeded');

    // Create some clients
    await Client.findOrCreate({
      where: { phone: '123-456-7890' },
      defaults: { name: 'Client A', email: 'clienta@example.com', address: '123 Main St' }
    });
    await Client.findOrCreate({
      where: { phone: '098-765-4321' },
      defaults: { name: 'Client B', email: 'clientb@example.com', address: '456 Oak Ave' }
    });
    console.log('Clients seeded');

    // Create some tags
    await Tag.findOrCreate({ where: { name: 'Sales' } });
    await Tag.findOrCreate({ where: { name: 'Support' } });
    console.log('Tags seeded');

  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

module.exports = seedDatabase;

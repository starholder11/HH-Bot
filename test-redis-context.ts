import { RedisContextService } from './services/context/RedisContextService';

async function testRedisContext() {
  console.log('Testing Redis Context Service...');

  const contextService = new RedisContextService();

  try {
    // Test 1: Get initial context
    console.log('\n1. Getting initial context...');
    const context1 = await contextService.getUserContext('test-user', 'default');
    console.log('Initial recent searches:', context1?.recentSearches);

    // Test 2: Add recent search
    console.log('\n2. Adding recent search...');
    await contextService.addRecentSearch('test-user', 'default', 'test search query');

    // Test 3: Get updated context
    console.log('\n3. Getting updated context...');
    const context2 = await contextService.getUserContext('test-user', 'default');
    console.log('Updated recent searches:', context2?.recentSearches);

    // Test 4: Add another search
    console.log('\n4. Adding another search...');
    await contextService.addRecentSearch('test-user', 'default', 'second search');

    // Test 5: Get final context
    console.log('\n5. Getting final context...');
    const context3 = await contextService.getUserContext('test-user', 'default');
    console.log('Final recent searches:', context3?.recentSearches);

    console.log('\nTest completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await contextService.close();
  }
}

testRedisContext();

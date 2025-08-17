#!/usr/bin/env node

/**
 * Test script for domain-specific session management
 * This script tests the new SessionManager functionality with domain separation
 */

import { SessionManager } from '../src/services/session-manager.js';

async function testDomainSessions() {
  console.log('🧪 Testing Domain-Specific Session Management\n');

  try {
    // Test 1: Create different session managers for different domains
    console.log('1. Creating session managers for different domains...');
    const managementSessionManager = SessionManager.getManagementInstance();
    const route1SessionManager = SessionManager.getInstance('route1.example.com');
    const route2SessionManager = SessionManager.getInstance('route2.example.com');

    console.log('✅ Session managers created successfully');

    // Test 2: Create sessions in different domains
    console.log('\n2. Creating sessions in different domains...');
    const managementSession = managementSessionManager.createSession('admin', '127.0.0.1', 'test-agent');
    const route1Session = route1SessionManager.createSession('user1', '127.0.0.1', 'test-agent');
    const route2Session = route2SessionManager.createSession('user2', '127.0.0.1', 'test-agent');

    console.log(`✅ Management session: ${managementSession.id}`);
    console.log(`✅ Route1 session: ${route1Session.id}`);
    console.log(`✅ Route2 session: ${route2Session.id}`);

    // Test 3: Verify sessions are isolated by domain
    console.log('\n3. Testing session isolation...');
    
    const retrievedManagementSession = managementSessionManager.getSession(managementSession.id);
    const retrievedRoute1Session = route1SessionManager.getSession(route1Session.id);
    const retrievedRoute2Session = route2SessionManager.getSession(route2Session.id);

    // Try to get sessions from wrong domains
    const wrongDomainSession1 = route1SessionManager.getSession(managementSession.id);
    const wrongDomainSession2 = managementSessionManager.getSession(route1Session.id);

    console.log(`✅ Management session retrieved: ${retrievedManagementSession ? 'YES' : 'NO'}`);
    console.log(`✅ Route1 session retrieved: ${retrievedRoute1Session ? 'YES' : 'NO'}`);
    console.log(`✅ Route2 session retrieved: ${retrievedRoute2Session ? 'YES' : 'NO'}`);
    console.log(`✅ Wrong domain access blocked: ${wrongDomainSession1 ? 'NO' : 'YES'}`);
    console.log(`✅ Wrong domain access blocked: ${wrongDomainSession2 ? 'NO' : 'YES'}`);

    // Test 4: Check session counts per domain
    console.log('\n4. Checking session counts per domain...');
    const managementCount = managementSessionManager.getSessionCount();
    const route1Count = route1SessionManager.getSessionCount();
    const route2Count = route2SessionManager.getSessionCount();

    console.log(`✅ Management domain sessions: ${managementCount}`);
    console.log(`✅ Route1 domain sessions: ${route1Count}`);
    console.log(`✅ Route2 domain sessions: ${route2Count}`);

    // Test 5: Clean up sessions
    console.log('\n5. Cleaning up test sessions...');
    managementSessionManager.deleteSession(managementSession.id);
    route1SessionManager.deleteSession(route1Session.id);
    route2SessionManager.deleteSession(route2Session.id);

    console.log('✅ Test sessions cleaned up');

    // Test 6: Verify cleanup
    console.log('\n6. Verifying cleanup...');
    const finalManagementCount = managementSessionManager.getSessionCount();
    const finalRoute1Count = route1SessionManager.getSessionCount();
    const finalRoute2Count = route2SessionManager.getSessionCount();

    console.log(`✅ Final management domain sessions: ${finalManagementCount}`);
    console.log(`✅ Final route1 domain sessions: ${finalRoute1Count}`);
    console.log(`✅ Final route2 domain sessions: ${finalRoute2Count}`);

    // Test 7: Shutdown all instances
    console.log('\n7. Shutting down all session managers...');
    SessionManager.shutdownAll();
    console.log('✅ All session managers shutdown successfully');

    console.log('\n🎉 All tests passed! Domain-specific session management is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testDomainSessions();

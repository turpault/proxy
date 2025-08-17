#!/bin/bash

# Functional Tests Runner for Bun Proxy Server
# This script runs all functional tests with proper setup and cleanup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="testing_scripts"
LOG_FILE="test-results.log"
TIMEOUT=300 # 5 minutes timeout

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to cleanup test processes and files
cleanup() {
    print_status "Cleaning up test resources..."
    
    # Kill any remaining test processes
    pkill -f "testing_scripts" 2>/dev/null || true
    pkill -f "bun.*test" 2>/dev/null || true
    
    # Clean up test files
    rm -rf "$TEST_DIR/test-static" 2>/dev/null || true
    rm -rf "$TEST_DIR/temp" 2>/dev/null || true
    
    # Remove test log files
    rm -f "$LOG_FILE" 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Bun is installed
    if ! command -v bun &> /dev/null; then
        print_error "Bun is not installed. Please install Bun first."
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found. Installing dependencies..."
        bun install
    fi
    
    # Check if test directory exists
    if [ ! -d "$TEST_DIR" ]; then
        print_error "Test directory $TEST_DIR not found."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to check for port conflicts
check_ports() {
    print_status "Checking for port conflicts..."
    
    local ports=(8443 8444 8445 8446 8447 8080 8081)
    local conflicts=()
    
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            conflicts+=($port)
        fi
    done
    
    if [ ${#conflicts[@]} -gt 0 ]; then
        print_warning "Port conflicts detected on ports: ${conflicts[*]}"
        print_warning "Please stop services using these ports or modify test configurations"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        print_success "No port conflicts detected"
    fi
}

# Function to run tests
run_tests() {
    local test_file="$1"
    local test_name="$2"
    
    print_status "Running $test_name..."
    
    # Run the test with timeout
    if timeout $TIMEOUT bun test "$test_file" --verbose 2>&1 | tee -a "$LOG_FILE"; then
        print_success "$test_name completed successfully"
        return 0
    else
        print_error "$test_name failed"
        return 1
    fi
}

# Function to run all tests
run_all_tests() {
    print_status "Starting functional test suite..."
    
    local start_time=$(date +%s)
    local failed_tests=()
    local total_tests=0
    local passed_tests=0
    
    # Test files and their descriptions
    declare -A test_files=(
        ["$TEST_DIR/functional-tests.ts"]="Core Functional Tests"
        ["$TEST_DIR/security-tests.ts"]="Security Tests"
        ["$TEST_DIR/process-management-tests.ts"]="Process Management Tests"
        ["$TEST_DIR/load-tests.ts"]="Load Tests"
    )
    
    # Run each test file
    for test_file in "${!test_files[@]}"; do
        if [ -f "$test_file" ]; then
            total_tests=$((total_tests + 1))
            
            if run_tests "$test_file" "${test_files[$test_file]}"; then
                passed_tests=$((passed_tests + 1))
            else
                failed_tests+=("${test_files[$test_file]}")
            fi
            
            # Small delay between tests
            sleep 2
        else
            print_warning "Test file $test_file not found, skipping..."
        fi
    done
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Print summary
    echo
    print_status "Test Summary:"
    echo "  Total tests: $total_tests"
    echo "  Passed: $passed_tests"
    echo "  Failed: ${#failed_tests[@]}"
    echo "  Duration: ${duration}s"
    
    if [ ${#failed_tests[@]} -gt 0 ]; then
        print_error "Failed tests:"
        for test in "${failed_tests[@]}"; do
            echo "  - $test"
        done
        return 1
    else
        print_success "All tests passed!"
        return 0
    fi
}

# Function to show help
show_help() {
    echo "Functional Tests Runner for Bun Proxy Server"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -c, --clean    Clean up test resources and exit"
    echo "  -v, --verbose  Run tests with verbose output"
    echo "  -t, --timeout  Set timeout in seconds (default: 300)"
    echo "  --test-file    Run specific test file"
    echo
    echo "Examples:"
    echo "  $0                    # Run all tests"
    echo "  $0 --clean           # Clean up and exit"
    echo "  $0 --test-file functional-tests.ts  # Run specific test"
    echo "  $0 --timeout 600     # Run with 10 minute timeout"
}

# Main script
main() {
    # Parse command line arguments
    local test_file=""
    local clean_only=false
    local timeout_override=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--clean)
                clean_only=true
                shift
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            -t|--timeout)
                timeout_override="$2"
                shift 2
                ;;
            --test-file)
                test_file="$2"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Set timeout if provided
    if [ -n "$timeout_override" ]; then
        TIMEOUT="$timeout_override"
    fi
    
    # Setup trap for cleanup on exit
    trap cleanup EXIT
    
    # Clean up first
    cleanup
    
    if [ "$clean_only" = true ]; then
        print_success "Cleanup completed"
        exit 0
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Check for port conflicts
    check_ports
    
    # Create test log file
    echo "Functional Test Results - $(date)" > "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    
    # Run tests
    if [ -n "$test_file" ]; then
        # Run specific test file
        if [ -f "$TEST_DIR/$test_file" ]; then
            run_tests "$TEST_DIR/$test_file" "$test_file"
        else
            print_error "Test file $TEST_DIR/$test_file not found"
            exit 1
        fi
    else
        # Run all tests
        run_all_tests
    fi
    
    # Final cleanup
    cleanup
    
    print_success "Test execution completed"
}

# Run main function
main "$@"

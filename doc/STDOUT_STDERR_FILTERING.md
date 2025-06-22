# STDOUT/STDERR Log Filtering

This document describes the stdout/stderr filtering functionality added to the process management interface.

## Overview

The management UI now supports filtering process logs by stream type (stdout vs stderr), allowing users to:
- View all logs (default)
- View only stdout logs
- View only stderr logs
- See visual distinction between stdout and stderr lines

## Features

### 1. Stream Detection

The system automatically detects and categorizes log lines by stream:

**Explicit Stream Prefixes:**
- `[STDOUT]` - Standard output
- `[STDERR]` - Standard error

**Pattern-based Detection (fallback):**
- Lines containing "ERROR", "WARN", "FATAL", "error", "warning", "fail", "exception" are classified as stderr
- All other lines are classified as stdout

### 2. Visual Distinction

**STDOUT Lines:**
- Blue left border (`#4299e1`)
- Normal background
- Standard text color

**STDERR Lines:**
- Red left border (`#f56565`)
- Light red background (`rgba(245, 101, 101, 0.1)`)
- Darker red background on hover (`rgba(245, 101, 101, 0.15)`)

### 3. Filter Controls

**Filter Buttons:**
- **All** (green) - Shows all log lines
- **STDOUT** (blue) - Shows only stdout lines
- **STDERR** (red) - Shows only stderr lines

**Active State:**
- Active filter button has darker color
- Inactive buttons have lighter color
- Visual feedback for current selection

### 4. Log Count Display

The log title shows:
- Current filter type (if not "All")
- Filtered count / Total count
- Example: "Process Logs (STDOUT) (1,234/5,678 lines)"

## Implementation Details

### Backend Changes

**Process Manager (`src/services/process-manager.ts`):**
- Added stream prefixes to log file output
- STDOUT: `[timestamp] [STDOUT] message`
- STDERR: `[timestamp] [STDERR] message`

**Management API (`src/services/management.ts`):**
- No changes required - existing log endpoint works with new format

### Frontend Changes

**HTML Structure (`src/static/management/index.html`):**
- Added filter button controls
- Updated log container structure
- Added CSS classes for stream styling

**JavaScript Functions:**
- `setLogFilter(filter)` - Sets current filter
- `updateProcessLogsDisplay()` - Updates display with filtering
- Enhanced log parsing with stream detection

**CSS Styling:**
- `.log-line.stdout` - STDOUT line styling
- `.log-line.stderr` - STDERR line styling
- `.logs-filter-btn` - Filter button styling
- Active state indicators

## Usage

### 1. Access Process Logs
1. Open the management UI
2. Navigate to the Processes section
3. Click on a process tab to load logs

### 2. Apply Filters
1. Use the filter buttons to switch between views:
   - **All** - View all logs
   - **STDOUT** - View only standard output
   - **STDERR** - View only error output

### 3. Monitor Live Updates
- Filter settings persist during live updates
- New logs are automatically categorized and filtered
- Log counts update in real-time

## Performance Considerations

### Large Log Volumes
- Filtering is done client-side for performance
- Logs are processed in 1,000-line chunks to avoid UI blocking
- Virtual scrolling for very large log files

### Memory Usage
- Logs are stored in memory for each process
- Filter state is maintained per process
- Automatic cleanup when switching processes

## Testing

### Automated Testing
Run the test script to verify functionality:
```bash
node test-log-filtering.js
```

### Manual Testing Checklist
1. ✅ Process tabs load correctly
2. ✅ Filter buttons respond to clicks
3. ✅ Visual distinction between stdout/stderr
4. ✅ Log counts update correctly
5. ✅ Live updates work with filters
6. ✅ Filter state persists during navigation

## Configuration

### Log Line Limits
- Configurable from 100 to 10,000 lines
- Default: 100 lines
- Higher limits may impact performance

### Stream Detection
- Automatic detection based on prefixes
- Fallback pattern matching for legacy logs
- Customizable detection rules in JavaScript

## Troubleshooting

### Common Issues

**No stream prefixes visible:**
- Check if processes are generating new logs
- Legacy logs may not have prefixes
- Pattern-based detection will still work

**Filter buttons not responding:**
- Check browser console for JavaScript errors
- Verify WebSocket connection for live updates
- Refresh the page if needed

**Performance issues with large logs:**
- Reduce log line count
- Use specific filters instead of "All"
- Consider log rotation for very active processes

### Debug Information
- Check browser developer tools for errors
- Monitor network requests to `/api/processes/:id/logs`
- Verify WebSocket connection status

## Future Enhancements

### Potential Improvements
1. **Custom Filter Rules** - User-defined patterns for stream detection
2. **Search Within Streams** - Text search with stream filtering
3. **Export Filtered Logs** - Download filtered log data
4. **Advanced Filtering** - Date ranges, log levels, etc.
5. **Stream Statistics** - Counts and trends for each stream

### Backward Compatibility
- Existing logs without prefixes still work
- Pattern-based detection provides fallback
- No breaking changes to existing functionality 
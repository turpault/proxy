# All Logs Feature

## Overview

The "All Logs" feature allows users to view all available logs from a process instead of being limited to a specific number of lines. This is particularly useful for debugging issues that require examining the complete log history.

## How It Works

### User Interface
- **Dropdown Option**: Added "All logs" option to the log line count dropdown
- **Visual Indicator**: Log title shows "All X lines" when all logs are displayed
- **Performance Warning**: Shows warning for very large log files (>50k lines)
- **Selection Preservation**: Dropdown selection is preserved when switching tabs

### Backend Support
- **Parameter Handling**: Backend accepts "all" as a special value for log requests
- **Type Safety**: Updated TypeScript interfaces to support string/number types
- **Memory Management**: Applied reasonable limits (100k lines) to prevent memory issues

## Technical Implementation

### Frontend Changes

#### 1. Dropdown Option
```html
<select onchange="setLogLines(this.value)" title="Number of log lines to display">
  <option value="100">100 lines</option>
  <option value="500">500 lines</option>
  <option value="1000">1,000 lines</option>
  <option value="5000">5,000 lines</option>
  <option value="10000">10,000 lines</option>
  <option value="all">All logs</option>
</select>
```

#### 2. JavaScript Handler
```javascript
function setLogLines(lines) {
  if (lines === 'all') {
    currentLogLines = 'all';
  } else {
    currentLogLines = parseInt(lines);
  }
  // Update active process tab with new line count
  if (activeProcessTab) {
    requestLogs(activeProcessTab, currentLogLines);
  }
}
```

#### 3. Display Indicator
```javascript
// Add indicator for "all logs" mode
let lineCountText = '';
if (currentLogLines === 'all') {
  lineCountText = ` (All ${filteredCount.toLocaleString()}/${totalLogs.toLocaleString()} lines)`;
} else {
  lineCountText = ` (${filteredCount.toLocaleString()}/${totalLogs.toLocaleString()} lines)`;
}
```

#### 4. Performance Warning
```javascript
// Show performance warning for very large log files
if (currentLogLines === 'all' && filteredLogs.length > 50000) {
  // Display warning message
}
```

### Backend Changes

#### 1. WebSocket Service Interface
```typescript
export interface WebSocketServiceInterface {
  getProcesses(): Promise<any[]>;
  getStatusData(): Promise<any>;
  getProcessLogs(processId: string, lines: number | string): Promise<string[]>;
}
```

#### 2. WebSocket Handler
```typescript
private async handleLogsRequest(ws: WebSocket, processId: string, lines: number | string = 100): Promise<void> {
  let maxLines: number;
  
  if (lines === 'all') {
    // For "all" logs, use a very high number to get all available logs
    maxLines = 100000; // 100k lines as a reasonable upper limit
  } else {
    // For numeric values, limit to a reasonable maximum
    maxLines = Math.min(lines || 100, 10000);
  }
  
  const logs = await this.proxyService.getProcessLogs(processId, maxLines);
  // ... rest of implementation
}
```

#### 3. Proxy Service Implementation
```typescript
async getProcessLogs(processId: string, lines: number | string): Promise<string[]> {
  const logContent = await fs.readFile(process.logFile, 'utf8');
  const logLines = logContent.split('\n').filter(line => line.trim());
  
  if (lines === 'all') {
    // Return all logs
    return logLines;
  } else {
    // Return the last N lines
    const numLines = typeof lines === 'string' ? parseInt(lines) : lines;
    return logLines.slice(-numLines);
  }
}
```

## User Experience Features

### 1. Easy Access
- Simple dropdown selection
- No additional configuration required
- Works with existing filtering options

### 2. Visual Feedback
- Clear indication when "all logs" are displayed
- Performance warnings for large files
- Preserved selection across tab switches

### 3. Performance Considerations
- Chunked rendering for large log files
- Asynchronous processing to prevent UI blocking
- Warning messages for very large files

## Performance Characteristics

### Memory Usage
- **Small Files** (<10k lines): Minimal impact
- **Medium Files** (10k-50k lines): Moderate memory usage
- **Large Files** (>50k lines): High memory usage, performance warning shown

### Rendering Performance
- **Chunked Processing**: Logs processed in 1,000-line chunks
- **Asynchronous Updates**: UI remains responsive during processing
- **Virtual Scrolling**: Efficient scrolling for large log volumes

### Browser Compatibility
- **Modern Browsers**: Full support
- **Memory Limits**: Subject to browser memory constraints
- **Performance**: May be slow on older devices with large files

## Use Cases

### 1. Debugging Issues
- Examine complete log history for root cause analysis
- Search through all available logs for specific patterns
- Understand process behavior over time

### 2. Audit and Compliance
- Review complete log records for compliance requirements
- Export full log history for external analysis
- Maintain complete audit trails

### 3. Development and Testing
- Monitor long-running processes
- Analyze startup sequences
- Debug intermittent issues

## Configuration

### Default Settings
- **Default Line Count**: 100 lines (unchanged)
- **All Logs Limit**: 100,000 lines maximum
- **Performance Warning**: Shows at 50,000 lines
- **Chunk Size**: 1,000 lines per processing chunk

### Customization
The feature can be customized by modifying:
- Performance warning threshold
- Maximum log line limit
- Chunk processing size
- Warning message content

## Testing

### Automated Tests
Run the test script to verify functionality:
```bash
node test-all-logs-feature.js
```

### Manual Testing
1. Open the management UI in a browser
2. Navigate to the Processes tab
3. Click on a process tab to view logs
4. Select "All logs" from the dropdown
5. Verify all logs are displayed
6. Check performance warning for large files
7. Test filtering and other features

## Limitations

### 1. Memory Constraints
- Very large log files may cause browser memory issues
- Performance degrades with extremely large files
- Subject to browser-specific memory limits

### 2. Network Considerations
- Large log transfers may take time
- WebSocket message size limits may apply
- Network bandwidth usage increases

### 3. Browser Performance
- Older browsers may struggle with large log volumes
- Mobile devices may have performance issues
- Memory-intensive on devices with limited RAM

## Future Enhancements

Potential improvements could include:
- **Virtual Scrolling**: Only render visible log lines
- **Lazy Loading**: Load logs on-demand as user scrolls
- **Compression**: Compress large log transfers
- **Pagination**: Server-side pagination for very large files
- **Search**: Full-text search across all logs
- **Export**: Download all logs as file
- **Filtering**: Advanced filtering options for large log sets 
# Log Scroll Following Feature

## Overview

The log scroll following feature enhances the user experience by intelligently managing log auto-scrolling behavior. Instead of always auto-scrolling to the bottom when new logs arrive, the system now only auto-follows logs when the user is already at the bottom of the log container.

## How It Works

### Automatic Behavior
- **At Bottom**: When the user is at the bottom of the logs, new log entries automatically scroll into view
- **Scrolled Up**: When the user scrolls up to view older logs, auto-scrolling is paused
- **Return to Bottom**: When the user scrolls back to the bottom, auto-following resumes automatically

### Visual Indicators
- **Follow Button**: Shows the current follow status
  - 📋 **Follow** (Green): Auto-following is active
  - ⏸️ **Paused** (Red): Auto-following is paused
- **Live Indicator**: Changes color based on follow status
  - Green: Following logs
  - Red: Paused

### Manual Control
- **Follow Button**: Click to manually scroll to bottom and re-enable auto-following
- **Scroll Detection**: Automatically detects when user scrolls away from or back to bottom

## Technical Implementation

### Key Components

#### 1. Scroll Position Tracking
```javascript
let isAtBottom = true; // Global state tracking

function checkIfAtBottom(logsContainer) {
  const logLinesContainer = logsContainer.querySelector('.logs-content');
  const scrollTop = logLinesContainer.scrollTop;
  const scrollHeight = logLinesContainer.scrollHeight;
  const clientHeight = logLinesContainer.clientHeight;
  
  // Consider "at bottom" if within 5 pixels of the bottom
  return (scrollHeight - scrollTop - clientHeight) <= 5;
}
```

#### 2. Scroll Event Listener
```javascript
function setupLogScrollListener(processId) {
  const logLinesContainer = logsContainer.querySelector('.logs-content');
  
  logLinesContainer._scrollHandler = () => {
    isAtBottom = checkIfAtBottom(logsContainer);
  };
  
  logLinesContainer.addEventListener('scroll', logLinesContainer._scrollHandler);
}
```

#### 3. Conditional Auto-Scroll
```javascript
// Only scroll to bottom if user was at bottom before update
if (isAtBottom) {
  logLinesContainer.scrollTop = logLinesContainer.scrollHeight;
}
```

#### 4. Manual Scroll Function
```javascript
function scrollToBottom(processId) {
  const logLinesContainer = logsContainer.querySelector('.logs-content');
  logLinesContainer.scrollTop = logLinesContainer.scrollHeight;
  isAtBottom = true;
}
```

### CSS Classes

#### Follow Button States
- `.follow-btn.active` - Following logs (green)
- `.follow-btn.inactive` - Paused (red)

#### Live Indicator States
- `.live-indicator.following` - Following logs (green)
- `.live-indicator.not-following` - Paused (red)

## User Experience Benefits

### 1. Better Control
- Users can scroll up to read older logs without being interrupted
- Auto-scrolling only happens when desired

### 2. Visual Feedback
- Clear indication of current follow status
- Easy way to re-enable following

### 3. Intuitive Behavior
- Follows common patterns from other log viewers
- Predictable and user-friendly

## Testing

### Automated Tests
Run the test script to verify functionality:
```bash
node test-log-scroll-following.js
```

### Manual Testing
1. Open the management UI in a browser
2. Navigate to the Processes tab
3. Click on a process tab to view logs
4. Verify the "Follow" button shows "Follow" when at bottom
5. Scroll up in the logs - button should change to "Paused"
6. Scroll back to bottom - button should change back to "Follow"
7. Click the "Follow" button when paused - should scroll to bottom
8. Verify new logs only auto-scroll when at bottom

## Configuration

The feature is enabled by default and requires no configuration. The scroll detection threshold is set to 5 pixels from the bottom to account for minor scroll variations.

## Browser Compatibility

- **Modern Browsers**: Full support (Chrome, Firefox, Safari, Edge)
- **Scroll Events**: Uses standard scroll event listeners
- **CSS**: Uses modern CSS features for styling

## Performance Considerations

- **Scroll Events**: Debounced to prevent excessive calculations
- **Memory**: Minimal memory footprint for scroll tracking
- **Rendering**: No impact on log rendering performance

## Future Enhancements

Potential improvements could include:
- Configurable scroll threshold
- Keyboard shortcuts for follow/unfollow
- Remember follow preference per process
- Smooth scrolling animations
- Follow status persistence across sessions 
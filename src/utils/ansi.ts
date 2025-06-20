/**
 * ANSI color code parser for log output
 */

export interface AnsiColor {
  foreground?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface AnsiToken {
  text: string;
  color?: AnsiColor;
}

/**
 * Parse ANSI color codes and convert to HTML/CSS
 */
export function parseAnsiToHtml(text: string): string {
  const tokens = parseAnsi(text);
  return tokens.map(token => {
    if (!token.color) {
      return escapeHtml(token.text);
    }
    
    const styles: string[] = [];
    if (token.color.foreground) {
      styles.push(`color: ${token.color.foreground}`);
    }
    if (token.color.background) {
      styles.push(`background-color: ${token.color.background}`);
    }
    if (token.color.bold) {
      styles.push('font-weight: bold');
    }
    if (token.color.italic) {
      styles.push('font-style: italic');
    }
    if (token.color.underline) {
      styles.push('text-decoration: underline');
    }
    
    if (styles.length === 0) {
      return escapeHtml(token.text);
    }
    
    return `<span style="${styles.join('; ')}">${escapeHtml(token.text)}</span>`;
  }).join('');
}

/**
 * Parse ANSI escape sequences into tokens
 */
export function parseAnsi(text: string): AnsiToken[] {
  const tokens: AnsiToken[] = [];
  let currentText = '';
  let currentColor: AnsiColor = {};
  
  // ANSI escape sequence regex
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match;
  
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before the escape sequence
    if (match.index > lastIndex) {
      currentText += text.slice(lastIndex, match.index);
    }
    
    // Process the escape sequence
    const codes = match[1].split(';').map(Number);
    currentColor = parseAnsiCodes(codes, currentColor);
    
    // If we have accumulated text, add it as a token
    if (currentText) {
      tokens.push({
        text: currentText,
        color: Object.keys(currentColor).length > 0 ? { ...currentColor } : undefined
      });
      currentText = '';
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    currentText += text.slice(lastIndex);
  }
  
  if (currentText) {
    tokens.push({
      text: currentText,
      color: Object.keys(currentColor).length > 0 ? { ...currentColor } : undefined
    });
  }
  
  return tokens;
}

/**
 * Parse ANSI color codes
 */
function parseAnsiCodes(codes: number[], currentColor: AnsiColor): AnsiColor {
  const color: AnsiColor = { ...currentColor };
  
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    
    switch (code) {
      case 0: // Reset
        return {};
      case 1: // Bold
        color.bold = true;
        break;
      case 3: // Italic
        color.italic = true;
        break;
      case 4: // Underline
        color.underline = true;
        break;
      case 30: case 31: case 32: case 33: case 34: case 35: case 36: case 37: // Foreground colors
        color.foreground = getColorName(code - 30);
        break;
      case 40: case 41: case 42: case 43: case 44: case 45: case 46: case 47: // Background colors
        color.background = getColorName(code - 40);
        break;
      case 90: case 91: case 92: case 93: case 94: case 95: case 96: case 97: // Bright foreground colors
        color.foreground = getBrightColorName(code - 90);
        break;
      case 100: case 101: case 102: case 103: case 104: case 105: case 106: case 107: // Bright background colors
        color.background = getBrightColorName(code - 100);
        break;
    }
  }
  
  return color;
}

/**
 * Get color name from ANSI code
 */
function getColorName(code: number): string {
  const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  return colors[code] || 'white';
}

/**
 * Get bright color name from ANSI code
 */
function getBrightColorName(code: number): string {
  const colors = ['bright-black', 'bright-red', 'bright-green', 'bright-yellow', 'bright-blue', 'bright-magenta', 'bright-cyan', 'bright-white'];
  return colors[code] || 'bright-white';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip ANSI codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
} 
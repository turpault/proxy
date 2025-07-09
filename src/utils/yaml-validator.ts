import { parse, YAMLError } from 'yaml';
import Joi from 'joi';
import { logger } from './logger';

// Import schemas from loader.ts
import {
  processManagementConfigSchema,
  configSchema as proxyConfigSchema,
  mainConfigSchema
} from '../config/loader';

export interface YAMLValidationResult {
  isValid: boolean;
  error?: string;
  line?: number;
  column?: number;
  details?: string;
  suggestions?: string[];
}

/**
 * Validate YAML content and return detailed error information
 */
export function validateYAML(content: string): YAMLValidationResult {
  try {
    // Try to parse the YAML content
    parse(content);

    return {
      isValid: true
    };
  } catch (error) {
    if (error instanceof YAMLError) {
      return parseYAMLError(error, content);
    } else if (error instanceof Error) {
      return {
        isValid: false,
        error: 'YAML parsing error',
        details: error.message,
        suggestions: getSuggestions(error.message)
      };
    } else {
      return {
        isValid: false,
        error: 'Unknown YAML error',
        details: String(error)
      };
    }
  }
}

/**
 * Parse YAML error and extract line/column information
 */
function parseYAMLError(error: YAMLError, content: string): YAMLValidationResult {
  const lines = content.split('\n');
  const message = error.message;

  // Extract line and column information from error message
  const lineMatch = message.match(/at line (\d+)/i);
  const columnMatch = message.match(/at column (\d+)/i);

  const line = lineMatch && lineMatch[1] ? parseInt(lineMatch[1]) : undefined;
  const column = columnMatch && columnMatch[1] ? parseInt(columnMatch[1]) : undefined;

  // Get the problematic line if available
  let problematicLine = '';
  if (line && line > 0 && line <= lines.length) {
    const lineContent = lines[line - 1];
    problematicLine = lineContent || '';
  }

  // Generate suggestions based on error type
  const suggestions = getSuggestions(message, problematicLine);

  // Format the error message
  let formattedError = message;
  if (line) {
    formattedError = `Line ${line}: ${message}`;
    if (problematicLine) {
      formattedError += `\n\nProblematic line:\n${problematicLine}`;
      if (column) {
        formattedError += `\n${' '.repeat(column - 1)}^`;
      }
    }
  }

  return {
    isValid: false,
    error: 'YAML syntax error',
    line,
    column,
    details: formattedError,
    suggestions
  };
}

/**
 * Generate helpful suggestions based on error message and problematic line
 */
function getSuggestions(errorMessage: string, problematicLine?: string): string[] {
  const suggestions: string[] = [];
  const lowerMessage = errorMessage.toLowerCase();

  // Common YAML syntax errors and suggestions
  if (lowerMessage.includes('unexpected end of stream')) {
    suggestions.push('Check for missing closing quotes, brackets, or braces');
    suggestions.push('Ensure all indentation is consistent');
  }

  if (lowerMessage.includes('duplicate key')) {
    suggestions.push('Remove duplicate keys in the same section');
    suggestions.push('Use unique key names for each entry');
  }

  if (lowerMessage.includes('invalid escape sequence')) {
    suggestions.push('Use proper escape sequences in strings');
    suggestions.push('For literal strings, use | or > instead of quotes');
  }

  if (lowerMessage.includes('mapping values are not allowed')) {
    suggestions.push('Check indentation - values should be properly indented under keys');
    suggestions.push('Ensure there are no extra spaces or tabs');
  }

  if (lowerMessage.includes('sequence entries are not allowed')) {
    suggestions.push('Check indentation for list items');
    suggestions.push('Use consistent indentation (spaces or tabs, not mixed)');
  }

  if (lowerMessage.includes('unexpected character')) {
    suggestions.push('Check for special characters that need to be quoted');
    suggestions.push('Ensure proper quoting around values containing special characters');
  }

  if (lowerMessage.includes('incomplete explicit mapping pair')) {
    suggestions.push('Add missing colon (:) after key names');
    suggestions.push('Ensure all key-value pairs are properly formatted');
  }

  if (lowerMessage.includes('incomplete explicit key')) {
    suggestions.push('Complete the key definition before the colon');
    suggestions.push('Check for missing key names');
  }

  if (lowerMessage.includes('incomplete flow mapping')) {
    suggestions.push('Check for missing closing braces {} in flow mappings');
    suggestions.push('Ensure all opening braces have matching closing braces');
  }

  if (lowerMessage.includes('incomplete flow sequence')) {
    suggestions.push('Check for missing closing brackets [] in flow sequences');
    suggestions.push('Ensure all opening brackets have matching closing brackets');
  }

  // Analyze problematic line for specific suggestions
  if (problematicLine) {
    const trimmedLine = problematicLine.trim();

    if (trimmedLine.includes(':') && !trimmedLine.includes(' ')) {
      suggestions.push('Add a space after the colon: "key: value"');
    }

    if (trimmedLine.startsWith('-') && !trimmedLine.includes(':')) {
      suggestions.push('List items should be properly indented');
    }

    if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
      suggestions.push('Check for missing closing brace }');
    }

    if (trimmedLine.includes('[') && !trimmedLine.includes(']')) {
      suggestions.push('Check for missing closing bracket ]');
    }

    if (trimmedLine.includes('"') && (trimmedLine.match(/"/g) || []).length % 2 !== 0) {
      suggestions.push('Check for unclosed quotes');
    }

    if (trimmedLine.includes("'") && (trimmedLine.match(/'/g) || []).length % 2 !== 0) {
      suggestions.push('Check for unclosed single quotes');
    }
  }

  // General YAML best practices
  suggestions.push('Use consistent indentation (2 or 4 spaces recommended)');
  suggestions.push('Quote strings that contain special characters or spaces');
  suggestions.push('Use | for literal strings and > for folded strings');

  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

/**
 * Format YAML error for display in UI
 */
export function formatYAMLError(result: YAMLValidationResult): string {
  if (result.isValid) {
    return 'YAML is valid';
  }

  let formatted = `YAML Error: ${result.error}`;

  if (result.line) {
    formatted += `\nLine: ${result.line}`;
  }

  if (result.column) {
    formatted += `\nColumn: ${result.column}`;
  }

  if (result.details) {
    formatted += `\n\nDetails:\n${result.details}`;
  }

  if (result.suggestions && result.suggestions.length > 0) {
    formatted += `\n\nSuggestions:\n${result.suggestions.map(s => `• ${s}`).join('\n')}`;
  }

  return formatted;
}

/**
 * Validate YAML with specific schema validation (for process configs)
 */
export function validateProcessConfigYAML(content: string): YAMLValidationResult {
  // First validate basic YAML syntax
  const basicValidation = validateYAML(content);
  if (!basicValidation.isValid) {
    return basicValidation;
  }

  try {
    // Parse the YAML
    const config = parse(content);

    // Validate using the schema from loader.ts
    const { error, value } = processManagementConfigSchema.validate(config, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return {
        isValid: false,
        error: 'Process configuration validation failed',
        details: errorMessages.join('\n'),
        suggestions: [
          'Check the process configuration documentation',
          'Ensure all required fields are present',
          'Verify field types (strings, arrays, objects)',
          'Make sure the "processes" section is properly defined'
        ]
      };
    }

    return { isValid: true };

  } catch (error) {
    return {
      isValid: false,
      error: 'Configuration validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Validate YAML with proxy configuration schema
 */
export function validateProxyConfigYAML(content: string): YAMLValidationResult {
  // First validate basic YAML syntax
  const basicValidation = validateYAML(content);
  if (!basicValidation.isValid) {
    return basicValidation;
  }

  try {
    // Parse the YAML
    const config = parse(content);

    // Validate using the schema from loader.ts
    const { error, value } = proxyConfigSchema.validate(config, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return {
        isValid: false,
        error: 'Proxy configuration validation failed',
        details: errorMessages.join('\n'),
        suggestions: [
          'Check the proxy configuration documentation',
          'Ensure all required fields are present',
          'Verify route configurations are properly formatted',
          'Check that SSL and Let\'s Encrypt settings are valid'
        ]
      };
    }

    return { isValid: true };

  } catch (error) {
    return {
      isValid: false,
      error: 'Configuration validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Validate YAML with main configuration schema
 */
export function validateMainConfigYAML(content: string): YAMLValidationResult {
  // First validate basic YAML syntax
  const basicValidation = validateYAML(content);
  if (!basicValidation.isValid) {
    return basicValidation;
  }

  try {
    // Parse the YAML
    const config = parse(content);

    // Validate using the schema from loader.ts
    const { error, value } = mainConfigSchema.validate(config, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return {
        isValid: false,
        error: 'Main configuration validation failed',
        details: errorMessages.join('\n'),
        suggestions: [
          'Check the main configuration documentation',
          'Ensure management port and host are properly configured',
          'Verify config file paths are correct',
          'Check that settings directories are properly defined'
        ]
      };
    }

    return { isValid: true };

  } catch (error) {
    return {
      isValid: false,
      error: 'Configuration validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
} 
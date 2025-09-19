// src/utils/dateUtils.ts
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

export const formatDateWithRelative = (dateInput: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  
  try {
    let date: Date;
    
    // Handle string dates (ISO format with or without timezone)
    if (typeof dateInput === 'string') {
      // Parse ISO string
      date = parseISO(dateInput);
      
      // If parsing failed, try creating a new Date
      if (!isValid(date)) {
        date = new Date(dateInput);
      }
    } else {
      date = dateInput;
    }
    
    // Check if date is valid
    if (!isValid(date)) {
      return 'Invalid date';
    }
    
    // Format as dd/mm/yyyy
    const formattedDate = format(date, 'dd/MM/yyyy');
    
    // Get relative time
    const relativeTime = formatDistanceToNow(date, { addSuffix: true });
    
    return `${formattedDate} (${relativeTime})`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

export const formatDate = (dateInput: string | Date | null): string => {
  if (!dateInput) return 'N/A';
  
  try {
    let date: Date;
    
    if (typeof dateInput === 'string') {
      date = parseISO(dateInput);
      if (!isValid(date)) {
        date = new Date(dateInput);
      }
    } else {
      date = dateInput;
    }
    
    if (!isValid(date)) {
      return 'Invalid date';
    }
    
    return format(date, 'dd/MM/yyyy');
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};
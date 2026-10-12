export const formatDateTime = (timestamp: string | number | Date | undefined | null): string => {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }

  let date: Date;

  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }

  if (isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const formatDate = (timestamp: string | number | Date | undefined | null): string => {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }

  let date: Date;

  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }

  if (isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
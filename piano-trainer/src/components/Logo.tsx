import React from 'react';
import { Piano } from '@mui/icons-material';

export const Logo: React.FC = () => {
  return (
    <div className="logo">
      <Piano sx={{ fontSize: 32, color: '#3498db' }} />
    </div>
  );
};

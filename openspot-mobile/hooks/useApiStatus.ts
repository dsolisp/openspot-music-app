import { useState, useEffect } from 'react';

const API_STATUS_URL = 'https://raw.githubusercontent.com/BlackHatDevX/openspot-config/refs/heads/main/apistatus.json';

export interface ApiStatus {
  ytmusic: { disabled: boolean };
}

export function useApiStatus() {
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApiStatus = async () => {
      try {
        const response = await fetch(API_STATUS_URL);
        const data = (await response.json()) as { ytmusic?: { disabled?: boolean } };
        setApiStatus({
          ytmusic: { disabled: Boolean(data?.ytmusic?.disabled) },
        });
      } catch (error) {
        console.error('Failed to fetch API status:', error);
        setApiStatus({ ytmusic: { disabled: false } });
      } finally {
        setLoading(false);
      }
    };

    fetchApiStatus();
  }, []);

  const isYouTubeDisabled = (): boolean => {
    if (!apiStatus) return false;
    return apiStatus.ytmusic.disabled;
  };

  return { apiStatus, loading, isYouTubeDisabled };
}

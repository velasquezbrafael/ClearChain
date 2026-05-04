import React from 'react';
import { Composition } from 'remotion';
import { ClearChainLaunch } from './ClearChainLaunch';

export const Root: React.FC = () => {
  return (
    <Composition
      id="ClearChainLaunch"
      component={ClearChainLaunch}
      durationInFrames={360}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

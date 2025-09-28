import React, { useEffect, useRef } from 'react';
import { DefineRoom } from '../defineRooms/DefineRoom';
import '../defineRooms/styles.css';

interface DefineRoomsStepProps {
  imageUrl: string | null;
  isActive: boolean;
  onInstanceReady?: (instance: DefineRoom | null) => void;
}

const DefineRoomsStep: React.FC<DefineRoomsStepProps> = ({ imageUrl, isActive, onInstanceReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DefineRoom | null>(null);
  const preparedImageRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (!instanceRef.current) {
      const instance = new DefineRoom();
      instance.mount(container);
      instanceRef.current = instance;
      onInstanceReady?.(instance);
    } else if (!container.contains(instanceRef.current.element)) {
      container.appendChild(instanceRef.current.element);
    }
    return () => {
      const instance = instanceRef.current;
      if (instance && container.contains(instance.element)) {
        container.removeChild(instance.element);
      }
      onInstanceReady?.(null);
    };
  }, [onInstanceReady]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    if (!imageUrl) {
      preparedImageRef.current = null;
      instance.close();
      return;
    }
    if (preparedImageRef.current === imageUrl) {
      if (isActive) {
        instance.show();
      }
      return;
    }
    let canceled = false;
    const image = new Image();
    image.onload = () => {
      if (canceled || instanceRef.current !== instance) {
        return;
      }
      preparedImageRef.current = imageUrl;
      instance.open(image);
      if (!isActive) {
        instance.close();
      }
    };
    image.onerror = () => {
      if (canceled || instanceRef.current !== instance) {
        return;
      }
      preparedImageRef.current = null;
      instance.close();
    };
    image.src = imageUrl;
    return () => {
      canceled = true;
    };
  }, [imageUrl, isActive]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    if (!preparedImageRef.current) {
      return;
    }
    if (isActive) {
      instance.show();
    } else {
      instance.close();
    }
  }, [isActive]);

  useEffect(() => {
    if (!onInstanceReady) {
      return;
    }
    if (instanceRef.current) {
      onInstanceReady(instanceRef.current);
    }
  }, [onInstanceReady]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="relative flex h-full w-full max-w-6xl flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6">
        <div ref={containerRef} className={isActive ? 'block' : 'hidden'} />
        {!imageUrl && (
          <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
            Upload a map image to start defining rooms.
          </div>
        )}
      </div>
    </div>
  );
};

export default DefineRoomsStep;

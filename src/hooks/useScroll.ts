import { useEffect, useRef, useState } from 'react';

interface UseScrollProps {
  totalItems: number;
  batchSize: number;
}

export function useScroll({ totalItems, batchSize }: UseScrollProps) {
  const [items, setItems] = useState<number[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 데이터 로드 함수
  const loadMore = () => {
    if (items.length >= totalItems || isLoading) {
      if (items.length >= totalItems) setHasMore(false);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setItems((prev) => [
        ...prev,
        ...Array.from({ length: batchSize }, (_, i) => prev.length + i + 1),
      ]);
      setIsLoading(false);
    }, 500); // 0.5초 로딩 시뮬레이션
  };

  // 초기 데이터 로드
  useEffect(() => {
    if (items.length === 0) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스크롤 위치 모니터링하여 미리 로딩
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current || isLoading || !hasMore) return;

      const container = scrollContainerRef.current;
      const scrollPosition = container.scrollTop + container.clientHeight;
      const scrollHeight = container.scrollHeight;

      // 사용자가 컨텐츠의 80% 지점에 도달했을 때 미리 로드
      if (scrollPosition > scrollHeight * 0.8) {
        loadMore();
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, hasMore, isLoading]);

  return {
    items,
    hasMore,
    isLoading,
    loadMore,
    scrollContainerRef,
  };
}

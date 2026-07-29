import { useEffect, useMemo, useState } from "react";
import { fetchCircles } from "../lib/circles";

// Shared Circle/CMP options for the master Circle list and per-circle CMP
// allow-list, fetched once from the backend (GET /api/circles) and reused by
// both the New Joining and Physical pages so they can never drift apart.
export default function useCircleOptions() {
  const [circles, setCircles] = useState([]);
  const [circleCmpMap, setCircleCmpMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchCircles()
      .then(({ circles: circleList, circleCmpMap: cmpMap }) => {
        if (isMounted) {
          setCircles(circleList);
          setCircleCmpMap(cmpMap);
        }
      })
      .catch((error) => {
        console.error("Failed to load circle list:", error);
        if (isMounted) {
          setCircles([]);
          setCircleCmpMap({});
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const circleOptions = useMemo(
    () => circles.map((circle) => ({ value: circle, label: circle })),
    [circles]
  );

  const getCmpOptions = useMemo(
    () => (circle) =>
      (circleCmpMap[circle] || []).map((cmp) => ({ value: cmp, label: cmp })),
    [circleCmpMap]
  );

  return { circles, circleCmpMap, circleOptions, getCmpOptions, loading };
}

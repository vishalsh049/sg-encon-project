import { useEffect, useState } from "react";
import { fetchDesignations } from "../lib/designations";

// Shared react-select options for the master Designation/Job Role list,
// fetched once from the backend (GET /api/designations) and reused by both
// the New Joining and Physical pages so they can never drift apart.
export default function useDesignationOptions() {
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchDesignations()
      .then((list) => {
        if (isMounted) setDesignations(list);
      })
      .catch((error) => {
        console.error("Failed to load designation list:", error);
        if (isMounted) setDesignations([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const options = designations.map((designation) => ({
    value: designation,
    label: designation,
  }));

  return { designations, options, loading };
}

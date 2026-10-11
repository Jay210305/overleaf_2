import { useQuery } from "@tanstack/react-query";
import { healthSchema } from "@latex-collab/contracts";
import { parsePublicConfig } from "@latex-collab/config";
const config = parsePublicConfig(import.meta.env);
export function HealthPanel() {
  const health = useQuery({
    queryKey: ["readiness"],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${config.VITE_API_URL}/health/ready`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      });
      if (!response.ok) throw new Error("Service unavailable");
      const result = healthSchema.parse(await response.json());
      if (result.status !== "ready") throw new Error("Service not ready");
      return result;
    },
    retry: false,
    refetchInterval: 5000,
  });
  return (
    <section aria-labelledby="health-heading">
      <h2 id="health-heading">Connection</h2>
      <p role="status">
        {health.isError
          ? "Service unavailable. Check the local services and try again."
          : health.isPending
            ? "Checking service…"
            : "Service ready"}
      </p>
      <button
        onClick={() => {
          void health.refetch();
        }}
        disabled={health.isFetching}
      >
        Check connection
      </button>
    </section>
  );
}

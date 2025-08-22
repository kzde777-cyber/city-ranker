export default function About() {
  return (
    <main className="max-w-2xl mx-auto p-6 text-gray-700 space-y-6">
      <h1 className="text-2xl font-bold">About CityRanker</h1>
      <p>
        CityRanker helps compare cities using open data from official sources
        (e.g., United Nations, World Bank, WHO, national statistics offices).
      </p>
      <p>
        We do not collect personal data, do not use cookies, and do not track visitors.
        All calculations are performed directly in your browser. Your settings can be shared
        only via URL parameters that you explicitly copy using the “Share” button.
      </p>
      <p>
        Disclaimer: The data is provided as-is, without guarantee of accuracy. Use for informational purposes only.
      </p>
      <p className="text-sm text-gray-500">
        Contact: 
      </p>
    </main>
  );
}

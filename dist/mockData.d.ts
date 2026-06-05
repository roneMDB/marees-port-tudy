interface TidalDataEntry {
    time: string;
    height: number;
}
interface ApiMareeResponse {
    site: string;
    timezone: string;
    from: string;
    to: string;
    step_minutes: number;
    unit: string;
    source: {
        title: string;
        producer: string;
        project: string;
        catalog: string;
        metadata_url: string;
        license_notice: string;
        access_notice: string;
        recommended_source_credit: string;
    };
    data: TidalDataEntry[];
    quota_unit: string;
    quota_limit: number;
    quota_remaining: number;
    quota_reset_at: string;
}
declare const mockData: ApiMareeResponse;
export default mockData;
//# sourceMappingURL=mockData.d.ts.map
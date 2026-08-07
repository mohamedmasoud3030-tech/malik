import { Building2, Download, Edit, Plus, Trash2, ChevronDown, ChevronUp, DoorOpen } from "lucide-react";
import { useState } from "react";
import { PropertyFormModal } from "./property-form-modal";
import { usePropertyListController } from "./use-property-list-controller";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntityCell } from "@/components/ui/entity-cell";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActiveFilterBar } from "@/components/ui/active-filter-bar";
import { EnterprisePage } from "@/components/enterprise/enterprise-page";
import { EnterpriseStats } from "@/components/enterprise/enterprise-stats";
import { EnterpriseDataTable } from "@/components/enterprise/enterprise-data-table";
import { toast } from "sonner";
import { buildPropertiesCsvBlob, buildPropertiesCsvFilename } from "./property-list-export";
import { propertyStatusTone } from "./components/property-status";
import type { PropertyListItem } from "./property-service";
import { getAppLanguageState, translateSharedLabel } from "@/lib/i18n";
import { useUnits } from "@/features/units/use-units";

function formatCount(value: number) { return new Intl.NumberFormat("en-US").format(value); }

function PropertyWorkflowStatus({ property }: Readonly<{ property: PropertyListItem }>) {
  const label = property.workflow_health === "ready" ? "جاهز" : property.workflow_health === "missing_owner" ? "يحتاج مالكاً" : property.workflow_health === "owner_unavailable" ? "المالك غير نشط" : "يحتاج اتفاقية";
  const owner = property.current_owner_name ? `المالك: ${property.current_owner_name}` : "لا يوجد ربط ساري";
  return (
    <div className="space-y-1">
      <StatusBadge tone={property.workflow_health === "ready" ? "success" : "warning"}>{label}</StatusBadge>
      <p className="text-[11px] text-muted-foreground">{owner}</p>
    </div>
  );
}

function PropertyInlineUnits({ propertyId }: { propertyId: string }) {
  const q = useUnits(propertyId);
  if (q.isLoading) return <p className="p-3 text-xs text-muted-foreground">جارٍ تحميل الوحدات...</p>;
  const units = q.data ?? [];
  if (units.length === 0) return <p className="p-3 text-xs text-muted-foreground">لا توجد وحدات — أضف وحدة لهذا العقار.</p>;
  return (
    <div className="border-t border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold">
        <DoorOpen className="size-3.5" /> الوحدات ({units.length}) — كل وحدة مع المستأجر وحالتها
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-xs">
            <span className="font-bold">{u.unit_number ?? u.id.slice(0,6)}</span>
            <span className="text-muted-foreground">{(u as unknown as { status?: string }).status ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type PropertiesListPageProps = Readonly<{ embedded?: boolean }>;

export function PropertiesListPage({ embedded = false }: PropertiesListPageProps) {
  const controller = usePropertyListController();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const readyCount = controller.properties.filter((p) => p.workflow_health === "ready").length;
  const linkedOwnerCount = controller.properties.filter((p) => Boolean(p.current_owner_name)).length;
  const attentionCount = controller.properties.length - readyCount;

  const handleExportCsv = () => {
    if (controller.properties.length === 0) { toast.error(translateSharedLabel("noResultsHint", getAppLanguageState().language)); return; }
    try {
      const url = URL.createObjectURL(buildPropertiesCsvBlob(controller.properties));
      const link = document.createElement("a"); link.href = url; link.download = buildPropertiesCsvFilename(new Date()); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 100); toast.success(translateSharedLabel("exportCsv", getAppLanguageState().language));
    } catch { toast.error("تعذر تصدير الملف"); }
  };

  const content = (
    <>
      <EnterpriseStats
        items={[
          { key: "total", label: "إجمالي العقارات", value: formatCount(controller.totalCount), icon: Building2 },
          { key: "linked", label: "مرتبطة بمالك", value: formatCount(linkedOwnerCount), icon: Building2 },
          { key: "ready", label: "جاهزة", value: formatCount(readyCount), icon: Building2 },
          { key: "attention", label: "تحتاج متابعة", value: formatCount(attentionCount), icon: Building2 },
        ]}
      />

      <EnterpriseDataTable
        rows={controller.properties}
        keyOf={(p) => p.id}
        aria-label="جدول العقارات"
        isLoading={controller.propertiesQuery.isLoading}
        error={controller.propertiesQuery.error}
        onRetry={() => controller.propertiesQuery.refetch()}
        emptyTitle={controller.hasFilterValues ? "لا توجد نتائج" : "لم تُضف عقارات بعد"}
        emptyDescription={controller.hasFilterValues ? "جرّب تغيير البحث أو الفلتر." : "ابدأ بإضافة أول عقار."}
        emptyAction={!controller.hasFilterValues ? <Button onClick={controller.openCreateModal}><Plus className="me-2 size-4" />إضافة أول عقار</Button> : undefined}
        onRowClick={(p) => controller.navigateToProperty(p.id)}
        rowActions={(p) => [
          { id: "toggle", label: expandedId === p.id ? "إخفاء الوحدات" : "عرض الوحدات", icon: expandedId === p.id ? ChevronUp : ChevronDown, onClick: () => setExpandedId(expandedId === p.id ? null : p.id) },
          { id: "edit", label: "تعديل", icon: Edit, onClick: () => controller.openEditModal(p.id) },
          { id: "archive", label: "أرشفة", icon: Trash2, variant: "destructive", onClick: () => controller.requestArchive(p.id, p.title ?? "عقار") },
        ]}
        renderMobileCard={(property) => (
          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{property.title ?? "عقار"}</span>
              <StatusBadge tone={propertyStatusTone[property.status as keyof typeof propertyStatusTone] ?? "gray"}>{controller.statusLabels[property.status as keyof typeof controller.statusLabels] ?? property.status}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{property.address ?? "—"}</p>
            <div className="mt-2"><PropertyWorkflowStatus property={property} /></div>
            {expandedId === property.id ? <PropertyInlineUnits propertyId={property.id} /> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="min-h-9 text-xs" onClick={() => controller.openEditModal(property.id)}><Edit className="size-3.5 me-1" />تعديل</Button>
              <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setExpandedId(expandedId === property.id ? null : property.id)}>{expandedId === property.id ? <ChevronUp className="size-3.5 me-1" /> : <ChevronDown className="size-3.5 me-1" />}{expandedId === property.id ? "إخفاء" : "الوحدات"}</Button>
            </div>
          </div>
        )}
        columns={[
          { key: "title", header: "العقار", cell: (p) => <EntityCell icon={Building2} title={p.title ?? "—"} /> },
          { key: "status", header: "الحالة", cell: (p) => <StatusBadge tone={propertyStatusTone[p.status as keyof typeof propertyStatusTone] ?? "gray"}>{controller.statusLabels[p.status as keyof typeof controller.statusLabels] ?? p.status}</StatusBadge> },
          { key: "workflow", header: "المالك", cell: (p) => <PropertyWorkflowStatus property={p} /> },
          { key: "address", header: "العنوان", cell: (p) => <span className="text-xs text-muted-foreground">{p.address ?? "—"}</span> },
        ]}
        pagination={controller.totalPages > 1 ? { page: controller.page, pageSize: 10, total: controller.totalCount, onPageChange: (v) => controller.setPage(v) } : undefined}
      />

      {expandedId ? (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <span className="text-sm font-bold">وحدات العقار — تفاصيل سريعة</span>
            <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)}>إغلاق</Button>
          </div>
          <PropertyInlineUnits propertyId={expandedId} />
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={handleExportCsv} disabled={controller.properties.length === 0}><Download className="me-2 size-4" />تصدير</Button>
            <Button onClick={controller.openCreateModal}><Plus className="me-2 size-4" />إضافة عقار</Button>
          </div>
          <div className="flex gap-2">
            <input value={controller.search} onChange={(e) => { controller.setSearch(e.target.value); controller.setPage(1); }} placeholder="بحث بالاسم أو العنوان..." className="h-9 flex-1 rounded-xl border px-3 text-sm" />
            <Select aria-label="الحالة" value={controller.status} onChange={(e) => { controller.setStatus(e.target.value as typeof controller.status); controller.setPage(1); }} className="w-36 rounded-xl"><option value="all">كل الحالات</option>{controller.statusValues.map((s) => <option key={s} value={s}>{controller.statusLabels[s]}</option>)}</Select>
          </div>
          <ActiveFilterBar filters={controller.activeFilters} onClearAll={controller.clearFilters} />
          {content}
        </div>
        <PropertyFormModal open={controller.modalOpen} onClose={controller.closeModal} propertyId={controller.editPropertyId} />
        <ConfirmDialog open={Boolean(controller.archiveTarget)} onOpenChange={(o) => { if (!o) controller.cancelArchive(); }} title={`أرشفة العقار "${controller.archiveTarget?.title ?? ""}"؟`} description="سيتم إخفاء العقار من القوائم النشطة." confirmLabel="أرشفة" isLoading={controller.isArchiving} onConfirm={controller.confirmArchive} />
      </>
    );
  }

  return (
    <>
      <EnterprisePage
        title="سجل العقارات والوحدات"
        description="العقار — المالك — الوحدات — المستأجر"
        actions={<><Button variant="secondary" onClick={handleExportCsv} disabled={controller.properties.length === 0}><Download className="me-2 size-4" />تصدير</Button><Button onClick={controller.openCreateModal}><Plus className="me-2 size-4" />إضافة عقار</Button></>}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input value={controller.search} onChange={(e) => { controller.setSearch(e.target.value); controller.setPage(1); }} placeholder="بحث بالاسم أو العنوان..." className="h-9 w-full sm:max-w-xs rounded-xl border px-3 text-sm" />
            <div className="flex items-center gap-2">
              <Select aria-label="الحالة" value={controller.status} onChange={(e) => { controller.setStatus(e.target.value as typeof controller.status); controller.setPage(1); }} className="w-36 rounded-xl"><option value="all">كل الحالات</option>{controller.statusValues.map((s) => <option key={s} value={s}>{controller.statusLabels[s]}</option>)}</Select>
              <ActiveFilterBar filters={controller.activeFilters} onClearAll={controller.clearFilters} />
            </div>
          </div>
        }
        maxWidth="full"
      >
        {content}
      </EnterprisePage>
      <PropertyFormModal open={controller.modalOpen} onClose={controller.closeModal} propertyId={controller.editPropertyId} />
      <ConfirmDialog open={Boolean(controller.archiveTarget)} onOpenChange={(o) => { if (!o) controller.cancelArchive(); }} title={`أرشفة العقار "${controller.archiveTarget?.title ?? ""}"؟`} description="سيتم إخفاء العقار من القوائم النشطة." confirmLabel="أرشفة" isLoading={controller.isArchiving} onConfirm={controller.confirmArchive} />
    </>
  );
}

export function PropertiesWorkspace({ embedded = true }: PropertiesListPageProps) { return <PropertiesListPage embedded={embedded} />; }

import { AlertCircle, Clock, Flame, PlusCircle, Printer, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { AsyncContentState } from '@/components/async-content-state';
import { EnterprisePage } from '@/components/enterprise/enterprise-page';
import { EnterpriseStats } from '@/components/enterprise/enterprise-stats';
import { ActiveFilterBar, type ActiveFilterItem } from '@/components/ui/active-filter-bar';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/ui/filter-bar';
import { Select } from '@/components/ui/select';
import { documentService } from '@/services/documents/DocumentService';
import { toReportDocumentPayload, type ReportDocumentData } from '@/services/documents/documentPayloadAdapters';
import { runDocumentAction } from '@/services/documents/runDocumentAction';
import { getTodayLocalDateString } from '@/features/reports/reports-page.helpers';
import { DocumentReadinessNotice } from '@/features/settings/components/document-readiness-notice';
import { useDocumentSettings } from '@/features/settings/useDocumentSettings';
import { MaintenanceDetailsOverlay, MaintenanceResolveOverlay } from './maintenance-detail-resolve-overlays';
import { MaintenanceList } from './maintenance-list';
import { maintenancePriorityLabels, maintenanceStatusLabels } from './maintenance-list';
import { MaintenanceRequestForm } from './maintenance-request-form';
import type { MaintenancePriorityFilter, MaintenanceStatusFilter } from '../maintenance-helpers';
import { useMaintenancePageController } from '../useMaintenancePageController';

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}



export type MaintenanceWorkspaceMode = 'standalone' | 'embedded';

export type MaintenanceWorkspaceProps = Readonly<{
  mode?: MaintenanceWorkspaceMode;
}>;

export function MaintenanceWorkspace({ mode = 'standalone' }: MaintenanceWorkspaceProps) {
  const controller = useMaintenancePageController();
  const documentSettings = useDocumentSettings();

  const activeFilters = useMemo<readonly ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = [];
    if (controller.statusFilter !== 'all') {
      items.push({
        key: 'status',
        label: 'الحالة',
        value: maintenanceStatusLabels[controller.statusFilter as keyof typeof maintenanceStatusLabels] ?? controller.statusFilter,
        onRemove: () => controller.setStatusFilter('all'),
      });
    }
    if (controller.priorityFilter !== 'all') {
      items.push({
        key: 'priority',
        label: 'الأولوية',
        value: maintenancePriorityLabels[controller.priorityFilter as keyof typeof maintenancePriorityLabels] ?? controller.priorityFilter,
        onRemove: () => controller.setPriorityFilter('all'),
      });
    }
    if (controller.propertyFilterId) {
      const propertyLabel = controller.properties.find(
        (property) => property.id === controller.propertyFilterId,
      )?.title ?? controller.propertyFilterId;
      items.push({
        key: 'property',
        label: 'العقار',
        value: propertyLabel,
        onRemove: () => controller.setPropertyFilterId(''),
      });
    }
    return items;
  }, [controller]);

  const clearAllFilters = () => {
    controller.setStatusFilter('all');
    controller.setPriorityFilter('all');
    controller.setPropertyFilterId('');
  };

  const currencyLabel =
    documentSettings.companySettings.currencySymbol ||
    documentSettings.companySettings.currency;

  const handlePrintMaintenanceList = () => {
    if (!documentSettings.isReady) return;
    const today = getTodayLocalDateString();
    const report = {
      reportTitle: 'كشف بلاغات وطلبات الصيانة الميدانية',
      reportType: 'Maintenance_Requests_Report',
      periodFrom: today,
      periodTo: today,
      sections: [
        {
          title: 'جدول طلبات الصيانة والتكلفة والأولوية',
          rows: controller.filteredMaintenanceRows.map((row) => ({
            label: `${row.title} - (${maintenancePriorityLabels[row.priority as keyof typeof maintenancePriorityLabels] ?? row.priority})`,
            value: `الحالة: ${maintenanceStatusLabels[row.status as keyof typeof maintenanceStatusLabels] ?? row.status} | المسؤول: ${row.assigned_to || row.technician_name || 'غير محدد'} | التكلفة: ${row.cost ? `${row.cost} ${currencyLabel}` : '—'}`,
          })),
        },
      ],
      totalSummary: `عدد الطلبات المدرجة: ${controller.filteredMaintenanceRows.length} طلب صيانة`,
    } satisfies ReportDocumentData;
    void runDocumentAction(
      () => documentService.printDocument('generic_report', {
        settings: documentSettings.companySettings,
        payload: toReportDocumentPayload(report),
      }),
      'تعذرت طباعة كشف الصيانة.',
    );
  };

  const printAction = (
    <Button
      type="button"
      variant="outline"
      onClick={handlePrintMaintenanceList}
      disabled={!documentSettings.isReady}
      className="min-h-11 gap-2 font-bold"
    >
      <Printer className="size-4 text-primary" aria-hidden="true" />
      طباعة كشف الصيانة A4
    </Button>
  );

  const createAction = (
    <Button
      type="button"
      onClick={controller.openCreateForm}
      className="min-h-11"
    >
      <PlusCircle className="me-2 size-4" aria-hidden="true" />
      طلب صيانة جديد
    </Button>
  );

  // Embedded mode (operations hub tab) keeps the historic inline rail;
  // standalone mode uses the PageHeader primary/secondary contract so the
  // secondary print action collapses into the mobile overflow sheet.
  const actions = (
    <div className="flex flex-col gap-2 sm:flex-row">
      {printAction}
      {createAction}
    </div>
  );

  const body = (
    <>
      {mode === 'embedded' ? (
        <div className="flex flex-wrap justify-end gap-2">
          {actions}
        </div>
      ) : null}

      {!documentSettings.isReady && !documentSettings.isLoading ? (
        <DocumentReadinessNotice />
      ) : null}

      <EnterpriseStats
        items={[
          { key: "urgent", label: "عاجلة", value: formatCount(controller.maintenanceSummary.urgent), icon: Flame },
          { key: "total", label: "الإجمالي", value: formatCount(controller.maintenanceSummary.total), icon: Wrench },
          { key: "open", label: "مفتوحة", value: formatCount(controller.maintenanceSummary.open), icon: AlertCircle },
          { key: "progress", label: "قيد التنفيذ", value: formatCount(controller.maintenanceSummary.inProgress), icon: Clock },
        ]}
      />

      <FilterBar
        filters={(
          <>
            <Select
              aria-label="تصفية حسب الحالة"
              value={String(controller.statusFilter)}
              onChange={(event) => controller.setStatusFilter(event.target.value as MaintenanceStatusFilter)}
            >
              <option value="all">كل الحالات</option>
              <option value="open">مفتوح</option>
              <option value="in_progress">قيد التنفيذ</option>
              <option value="resolved">تم الحل</option>
              <option value="closed">مغلق</option>
            </Select>
            <Select
              aria-label="تصفية حسب الأولوية"
              value={String(controller.priorityFilter)}
              onChange={(event) => controller.setPriorityFilter(event.target.value as MaintenancePriorityFilter)}
            >
              <option value="all">كل الأولويات</option>
              <option value="low">منخفضة</option>
              <option value="medium">متوسطة</option>
              <option value="high">عالية</option>
              <option value="urgent">عاجلة</option>
            </Select>
            <Select
              aria-label="تصفية حسب العقار"
              value={controller.propertyFilterId}
              onChange={(event) => controller.setPropertyFilterId(event.target.value)}
            >
              <option value="">كل العقارات</option>
              {controller.properties.map((property) => (
                <option key={property.id} value={property.id}>{property.title}</option>
              ))}
            </Select>
          </>
        )}
        actions={controller.hasFilters ? (
          <Button type="button" variant="secondary" onClick={clearAllFilters}>
            مسح الفلاتر
          </Button>
        ) : undefined}
      />

      <ActiveFilterBar filters={activeFilters} onClearAll={clearAllFilters} />

      <section
        data-maintenance-register
        className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card"
      >
        <header className="flex flex-col gap-3 border-b border-border/70 bg-muted/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/9 text-primary">
                <Wrench className="size-4.5" aria-hidden="true" />
              </span>
              <h2 className="text-base font-black">سجل طلبات الصيانة</h2>
            </div>
            <p className="mt-1.5 text-xs font-medium text-muted-foreground">
              {formatCount(controller.filteredMaintenanceRows.length)} طلب ضمن العرض الحالي.
            </p>
          </div>
          {controller.maintenanceSummary.urgent > 0 ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-black text-destructive">
              <Flame className="size-3.5" aria-hidden="true" />
              {formatCount(controller.maintenanceSummary.urgent)} عاجلة
            </span>
          ) : null}
        </header>

        <div className="p-3 sm:p-4">
          <AsyncContentState
            status={controller.isLoading
              ? 'loading'
              : controller.hasLoadError
                ? 'error'
                : controller.filteredMaintenanceRows.length === 0
                  ? 'empty'
                  : 'ready'}
            error={controller.loadError}
            errorTitle="تعذر تحميل طلبات الصيانة"
            errorAction={(
              <Button type="button" onClick={controller.retryMaintenanceWorkspace}>
                إعادة المحاولة
              </Button>
            )}
            emptyTitle="لا توجد طلبات صيانة"
            emptyDescription={controller.hasFilters
              ? 'لا توجد طلبات تطابق الفلاتر الحالية.'
              : 'أضف طلب صيانة جديد للبدء.'}
          >
            <MaintenanceList
              rows={controller.filteredMaintenanceRows}
              properties={controller.properties}
              allUnits={controller.allUnits}
              actionsPending={
                controller.updateStatusMutation.isPending ||
                controller.resolveMutation.isPending
              }
              onViewDetails={controller.setDetailsRequest}
              onEdit={controller.openEditForm}
              onStatusAction={controller.handleStatusAction}
            />
          </AsyncContentState>
        </div>
      </section>

      <MaintenanceRequestForm
        open={controller.showForm}
        isEditing={Boolean(controller.editingRequest)}
        isEditingResolvedRequest={controller.isEditingResolvedRequest}
        isSubmitting={
          controller.createMutation.isPending ||
          controller.updateRequestMutation.isPending
        }
        isLoadingUnits={controller.unitsQuery.isLoading}
        form={controller.form}
        formPropertyId={controller.formPropertyId}
        properties={controller.properties}
        units={controller.units}
        firstError={controller.firstCreateError}
        onOpenChange={controller.setShowForm}
        onSubmit={controller.onSubmit}
      />

      <MaintenanceDetailsOverlay
        request={controller.detailsRequest}
        onOpenChange={(open) => {
          if (!open) controller.setDetailsRequest(null);
        }}
      />

      <MaintenanceResolveOverlay
        target={controller.resolveTarget}
        form={controller.resolveForm}
        isSubmitting={controller.resolveMutation.isPending}
        firstError={controller.firstResolveError}
        onOpenChange={(open) => {
          if (!open) controller.setResolveTarget(null);
        }}
        onSubmit={controller.submitResolve}
      />
    </>
  );

  if (mode === 'embedded') {
    return (
      <div data-visual-wave="malek-pro" className="space-y-5">
        {body}
      </div>
    );
  }

  return (
    <EnterprisePage
        title="طلبات الصيانة"
        description="الصيانة — الأولوية — الحالة — التكلفة"
        actions={<>{printAction}{createAction}</>}
        maxWidth="full"
      >
      {body}
    </EnterprisePage>
  );
}

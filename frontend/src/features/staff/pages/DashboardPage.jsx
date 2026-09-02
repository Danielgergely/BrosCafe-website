import { useState } from "react";
import {
  ArrowsClockwise, ChartLine, Coffee, FunnelSimple, Gear, Gift, Image as ImageIcon, ListChecks,
  Newspaper, Plus, ScanSmiley, SignOut, Storefront, Users, UsersThree, Wallet,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import BrosLogo from "@/components/layout/BrosLogo";
import LanguageToggle from "@/components/layout/LanguageToggle";
import { ROUTES } from "@/config/site";
import { Modal, adminInputClass } from "@/features/staff/components/AdminPrimitives";
import CoffeePanel from "@/features/staff/panels/CoffeePanel";
import CustomersPanel from "@/features/staff/panels/CustomersPanel";
import FunnelPanel from "@/features/staff/panels/FunnelPanel";
import JournalPanel from "@/features/staff/panels/JournalPanel";
import MediaPanel from "@/features/staff/panels/MediaPanel";
import MembersPanel from "@/features/staff/panels/MembersPanel";
import OverviewPanel from "@/features/staff/panels/OverviewPanel";
import ProductsPanel from "@/features/staff/panels/ProductsPanel";
import RetentionPanel from "@/features/staff/panels/RetentionPanel";
import RewardsPanel from "@/features/staff/panels/RewardsPanel";
import SegmentsPanel from "@/features/staff/panels/SegmentsPanel";
import TransactionsPanel from "@/features/staff/panels/TransactionsPanel";
import WalletPanel from "@/features/staff/panels/WalletPanel";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";
import { useStaff } from "@/state/StaffAuth";

/** Tab order, icon and panel. Adding a view means one entry here. */
const TABS = [
  // Content first: this is what gets edited weekly, unlike the analytics.
  { id: "products", icon: Storefront, Panel: ProductsPanel },
  { id: "journal", icon: Newspaper, Panel: JournalPanel },
  { id: "photos", icon: ImageIcon, Panel: MediaPanel },
  { id: "overview", icon: ChartLine, Panel: OverviewPanel },
  { id: "funnel", icon: FunnelSimple, Panel: FunnelPanel },
  { id: "customers", icon: Users, Panel: CustomersPanel },
  { id: "coffee", icon: Coffee, Panel: CoffeePanel },
  { id: "rewards", icon: Gift, Panel: RewardsPanel },
  { id: "retention", icon: ArrowsClockwise, Panel: RetentionPanel },
  { id: "segments", icon: UsersThree, Panel: SegmentsPanel },
  { id: "transactions", icon: ListChecks, Panel: TransactionsPanel },
  { id: "members", icon: UsersThree, Panel: MembersPanel },
  { id: "wallet", icon: Wallet, Panel: WalletPanel },
];

const SETTINGS_FIELDS = [
  "active_days", "inactive_days", "new_days", "almost_reward_stamps", "loyal_cycles",
];

const EMPTY_STAFF = { name: "", email: "", password: "", role: "staff" };

export default function DashboardPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { signOut } = useStaff();

  const [activeTab, setActiveTab] = useState("products");
  const [staffForm, setStaffForm] = useState(null);
  const [settings, setSettings] = useState(null);

  const { Panel } = TABS.find((tab) => tab.id === activeTab);

  const openSettings = async () => {
    try {
      const { data } = await api.get("/admin/settings");
      setSettings(data);
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    try {
      await api.put(
        "/admin/settings",
        Object.fromEntries(SETTINGS_FIELDS.map((key) => [key, Number(settings[key])])),
      );
      toast.success(t("admin.saved"));
      setSettings(null);
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  const createStaff = async (event) => {
    event.preventDefault();
    try {
      await api.post("/staff", staffForm);
      toast.success(t("admin.staffAdded"));
      setStaffForm(null);
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <BrosLogo />
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <button
              data-testid="go-scanner-btn"
              onClick={() => navigate(ROUTES.staff)}
              className="flex items-center gap-2 text-sm font-medium text-olive hover:underline"
            >
              <ScanSmiley size={18} weight="light" /> {t("admin.scanner")}
            </button>
            <button
              data-testid="open-settings-btn"
              onClick={openSettings}
              aria-label={t("admin.settingsTitle")}
              className="text-muted transition-colors hover:text-olive"
            >
              <Gear size={20} weight="light" />
            </button>
            <button
              data-testid="admin-logout-btn"
              onClick={signOut}
              aria-label={t("account.logOut")}
              className="text-muted transition-colors hover:text-olive"
            >
              <SignOut size={20} weight="light" />
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-olive">
              {t("admin.kicker")}
            </p>
            <h1 className="mt-1 font-display text-4xl text-ink">{t("admin.title")}</h1>
          </div>
          <button
            data-testid="add-staff-btn"
            onClick={() => setStaffForm(EMPTY_STAFF)}
            className="flex w-fit items-center gap-2 rounded-card bg-olive px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-olive-dark"
          >
            <Plus size={18} weight="bold" /> {t("admin.addStaff")}
          </button>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-olive text-cream"
                    : "border border-line bg-white text-ink hover:border-olive"
                }`}
              >
                <Icon size={16} weight={active ? "fill" : "light"} /> {t(`admin.tabs.${tab.id}`)}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Panel />
        </div>
      </div>

      {staffForm && (
        <Modal title={t("admin.createStaff")} onClose={() => setStaffForm(null)}>
          <form onSubmit={createStaff} className="space-y-4">
            {["name", "email", "password"].map((field) => (
              <input
                key={field}
                data-testid={`staff-${field}-input`}
                type={field === "name" ? "text" : field}
                value={staffForm[field]}
                onChange={(event) => setStaffForm({ ...staffForm, [field]: event.target.value })}
                placeholder={t(`admin.${field}`)}
                required
                className={adminInputClass}
              />
            ))}
            <select
              data-testid="staff-role-select"
              value={staffForm.role}
              onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}
              aria-label={t("admin.role")}
              className={adminInputClass}
            >
              <option value="staff">{t("admin.roleStaff")}</option>
              <option value="admin">{t("admin.roleAdmin")}</option>
            </select>
            <button
              data-testid="staff-submit-btn"
              type="submit"
              className="h-14 w-full rounded-card bg-olive font-semibold text-cream hover:bg-olive-dark"
            >
              {t("admin.create")}
            </button>
          </form>
        </Modal>
      )}

      {settings && (
        <Modal title={t("admin.settingsTitle")} onClose={() => setSettings(null)}>
          <form onSubmit={saveSettings} className="space-y-4" data-testid="settings-form">
            {SETTINGS_FIELDS.map((field) => (
              <div key={field}>
                <label
                  htmlFor={`setting-${field}`}
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {t(`admin.settingsFields.${field}`)}
                </label>
                <input
                  id={`setting-${field}`}
                  data-testid={`setting-${field}`}
                  type="number"
                  min="1"
                  value={settings[field]}
                  onChange={(event) => setSettings({ ...settings, [field]: event.target.value })}
                  className={`mt-1 ${adminInputClass}`}
                />
              </div>
            ))}
            <button
              data-testid="settings-save-btn"
              type="submit"
              className="h-14 w-full rounded-card bg-olive font-semibold text-cream hover:bg-olive-dark"
            >
              {t("admin.save")}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

import {
  LuBuilding2,
  LuChevronDown,
  LuCreditCard,
  LuDownload,
  LuFileCode2,
  LuHash,
  LuLanguages,
  LuLayoutTemplate,
  LuPackage,
  LuPalette,
  LuPercent,
  LuSun,
} from "../components/icons.tsx";
import { ComponentType } from "preact";

// Map icon names to components - icons must be imported here since they can't be serialized
const iconMap: Record<string, ComponentType<{ size?: number }>> = {
  LuBuilding2,
  LuCreditCard,
  LuDownload,
  LuFileCode2,
  LuHash,
  LuLanguages,
  LuLayoutTemplate,
  LuPackage,
  LuPalette,
  LuPercent,
  LuSun,
};

interface SettingsNavProps {
  currentSection: string;
  currentLabel: string;
  sections: Array<
    {
      value: string;
      label: string;
      icon: string; // Changed from ComponentType to string (icon name)
      show?: boolean;
    }
  >;
}

export default function SettingsNav(
  { currentSection, currentLabel, sections }: SettingsNavProps,
) {
  return (
    <div class="dropdown dropdown-bottom w-full">
      <div
        tabIndex={0}
        role="button"
        class="btn btn-outline w-full justify-between"
      >
        <span>{currentLabel}</span>
        <LuChevronDown size={18} />
      </div>
      <ul
        tabIndex={0}
        class="dropdown-content menu bg-base-100 rounded-box z-[1] w-full p-2 shadow-lg border border-base-300 mt-2"
      >
        {sections.filter((s) => s.show !== false).map((section) => {
          const Icon = iconMap[section.icon] || LuBuilding2;
          return (
            <li>
              <a
                href={section.value}
                class={`hover:bg-base-200 ${
                  currentSection === section.value ? "active" : ""
                }`}
              >
                <Icon size={18} />
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

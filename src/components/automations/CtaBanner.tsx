import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui";

export function CtaBanner({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6">
      <div className="relative overflow-hidden rounded-[20px] bg-purple-50 px-6 py-8 sm:px-10 sm:py-10">
        <div className="relative z-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="hidden h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 shadow-brand sm:grid">
              <Bot size={30} className="text-white" />
            </span>
            <div>
              <h2 className="text-[20px] font-bold text-ink sm:text-[22px]">
                Ready to automate your first trade?
              </h2>
              <p className="mt-1 max-w-[440px] text-[13.5px] leading-relaxed text-sub">
                Join thousands of traders who automate their strategies and never miss opportunities.
              </p>
            </div>
          </div>
          <Button color="brand" size="lg" leftIcon={<Plus size={17} />} onClick={onCreate} className="shrink-0">
            Create Automation
          </Button>
        </div>

        {/* decorative bar-chart flourish, bottom-right */}
        <div className="pointer-events-none absolute bottom-0 right-0 flex items-end gap-1.5 px-6 pb-4 opacity-60" aria-hidden="true">
          {[18, 28, 22, 36, 30, 44].map((h, i) => (
            <span key={i} className="w-3 rounded-t-[3px] bg-purple-300" style={{ height: h }} />
          ))}
        </div>
      </div>
    </section>
  );
}

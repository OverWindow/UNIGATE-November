import { Check, X } from "lucide-react";

const OfferList = ({
  text,
  status,
}: {
  text: string;
  status: "active" | "inactive";
}) => {
  const isActive = status === "active";

  return (
    <div className="mb-3 flex items-start">
      <span
        className={`mr-3 flex h-[18px] w-[18px] items-center justify-center rounded-full ${
          isActive
            ? "bg-primary/10 text-primary"
            : "bg-black/5 text-black/30  "
        }`}
      >
        {isActive ? <Check size={12} /> : <X size={12} />}
      </span>

      <p
        className={`m-0 text-base font-medium ${
          isActive ? "text-body-color" : "text-body-color/60 "
        }`}
      >
        {text}
      </p>
    </div>
  );
};

export default OfferList;

import TextInput from "../../../components/ui/TextInput";
import NoteColorPicker from "./NoteColorPicker";
import RichNoteEditor from "./RichNoteEditor";

export default function NoteFormFields({ form, onChange, onContentChange }) {
  return (
    <div className="space-y-4">
      <TextInput
        label="Título"
        name="title"
        placeholder="Título da anotação"
        value={form.title}
        onChange={onChange}
      />

      <RichNoteEditor value={form.content} onChange={onContentChange} />

      <NoteColorPicker value={form.color} onChange={onChange} />
    </div>
  );
}

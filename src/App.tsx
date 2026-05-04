import { CContainer, CSpinner } from "@coreui/react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { PersonTodoManagerJson } from "./features/personTodo";
import { useGetFormIdsQuery } from "./features/personTodo/personApi";

function PersonTodoListRoute() {
  const { data: formIds, isLoading, error } = useGetFormIdsQuery();

  if (isLoading) {
    return (
      <CContainer className="py-4">
        <div role="status" aria-live="polite">
          <CSpinner /> Loading person todo forms...
        </div>
      </CContainer>
    );
  }

  if (error) {
    return (
      <CContainer className="py-4">
        <p role="alert">Unable to load person todo forms.</p>
      </CContainer>
    );
  }

  return (
    <CContainer className="py-4">
      <h1>Person Todo Managers</h1>
      <p>Select a manager to edit:</p>

      <ul className="list-unstyled d-flex flex-column gap-2">
        {(formIds ?? []).map((formId) => (
          <li
            key={formId}
            className="d-flex align-items-center gap-2 flex-wrap"
          >
            <span>{formId}</span>
            <Link
              className="btn btn-primary btn-sm"
              to={`/person-todos-json/${formId}`}
            >
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </CContainer>
  );
}

function PersonTodoJsonRoute() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate to="/person-todos-json/default" replace />;
  }

  return <PersonTodoManagerJson id={id} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PersonTodoListRoute />} />
        <Route
          path="/person-todos-json/:id"
          element={<PersonTodoJsonRoute />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

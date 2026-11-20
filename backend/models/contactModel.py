from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from database import Base


class ContactMessage(Base):
    """A message sent from the Contact page (see migration 004)."""

    __tablename__ = "contact_messages"

    message_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    topic = Column(String(20), nullable=False)          # order | custom | product | other
    order_number = Column(String(20))
    message = Column(Text, nullable=False)
    status = Column(String(10), nullable=False, server_default="new")  # new | read | replied
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
